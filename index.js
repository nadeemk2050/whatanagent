import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, orderBy, getDocs } from "firebase/firestore";
import { onRequest } from "firebase-functions/v2/https";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyDGhwmtpHazLrDWDXjK3WoGPh610mrJeaI",
  authDomain: "whatanagent-a1e59.firebaseapp.com",
  projectId: "whatanagent-a1e59",
  storageBucket: "whatanagent-a1e59.firebasestorage.app",
  messagingSenderId: "410197132578",
  appId: "1:410197132578:web:97cfc3ae33f39ed3df917b",
  measurementId: "G-DLP9RRWHV2"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// --- Settings Management ---
async function getSettings() {
  try {
    const docSnap = await getDoc(doc(db, "appData", "settings"));
    if (docSnap.exists()) return docSnap.data();
  } catch(e) { console.error("Error reading settings", e); }
  return {};
}

// Automatic Migration from .env to Firestore on boot
async function migrateEnvToDb() {
  try {
    const docSnap = await getDoc(doc(db, "appData", "settings"));
    if (!docSnap.exists() && process.env.WHATSAPP_TOKEN) {
       await setDoc(doc(db, "appData", "settings"), {
          DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
          WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN || '',
          PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID || '',
          VERIFY_TOKEN: process.env.VERIFY_TOKEN || '',
          OWNER_PHONE_NUMBER: process.env.OWNER_PHONE_NUMBER || ''
       });
       console.log("Migrated .env to Firestore Settings successfully!");
    }
  } catch (e) { console.error("Migration error:", e); }
}
migrateEnvToDb();

// --- Core Helper Functions ---
async function sendWhatsAppMessage(to, text, settings) {
  const token = settings.WHATSAPP_TOKEN;
  const phoneId = settings.PHONE_NUMBER_ID;
  const apiVersion = process.env.API_VERSION || 'v20.0';
  
  if (!token || !phoneId) {
    console.error("Missing WhatsApp Token or Phone ID in DB Settings.");
    return;
  }

  try {
    await axios({
      method: 'POST',
      url: `https://graph.facebook.com/${apiVersion}/${phoneId}/messages`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text }
      }
    });

    // Log to Firestore
    await addDoc(collection(db, "chats", to, "messages"), {
      sender: "bot",
      text: text,
      timestamp: Date.now()
    });
  } catch (err) { 
    console.error("Error sending WhatsApp message:", err.response ? err.response.data : err.message); 
  }
}

async function generateAIResponse(userPrompt, senderNumber, settings) {
  const provider = settings.ACTIVE_AI_PROVIDER || 'deepseek';

  if (provider === 'deepseek' && !settings.DEEPSEEK_API_KEY) {
    return "I'm sorry, my DeepSeek AI backend is not fully configured yet. Please configure the DEEPSEEK_API_KEY.";
  }
  if (provider === 'gemini' && !settings.GEMINI_API_KEY) {
    return "I'm sorry, my Gemini AI backend is not fully configured yet. Please configure the GEMINI_API_KEY.";
  }

  try {
    // Dynamically load knowledge
    let knowledgeBase = "";
    try {
      const docSnap = await getDoc(doc(db, "appData", "knowledge"));
      if (docSnap.exists()) {
        const kb = docSnap.data();
        knowledgeBase = `
          Company Profile: ${kb.companyProfile}
          Timings: ${kb.timings}
          Location & Branches: ${kb.locationAndBranches}
          Products: ${kb.products}
          Logistics: ${kb.logistics}
          Custom Rules: ${kb.customRules}
          Website Scraped Data: ${kb.scrapedData || 'None'}
        `;
      }
    } catch (err) { console.warn("Could not load knowledge", err); }

    // Contact tracking
    let needsGreeting = false;
    let needsOnboarding = true;
    const contactsRef = doc(db, "appData", "contacts");
    try {
      const contactsSnap = await getDoc(contactsRef);
      const contacts = contactsSnap.exists() ? contactsSnap.data() : {};
      const today = new Date().toDateString();
      const cInfo = contacts[senderNumber] || {};
      
      if (!contacts[senderNumber] || contacts[senderNumber].lastGreetingDate !== today) {
        needsGreeting = true;
        contacts[senderNumber] = {
          ...cInfo,
          lastGreetingDate: today,
          firstContacted: cInfo.firstContacted || new Date().toISOString()
        };
        await setDoc(contactsRef, contacts);
      }
      
      if (cInfo.leadName && cInfo.leadCompany && cInfo.leadProducts && cInfo.leadEmail && cInfo.leadWebsite) {
        needsOnboarding = false;
      }
    } catch (err) { needsGreeting = true; }

    let systemInstruction = 
      "You are a strict, efficient AI customer assistant for a company. " +
      "CRITICAL RULE: You MUST ONLY answer questions using the exact information provided in the Knowledge Base below. " +
      "If the user asks something that is NOT in the Knowledge Base, you MUST politely refuse to answer and state that you do not have that information. " +
      "Do NOT hallucinate, invent, or assume any information outside of this Knowledge Base. " +
      "You are fully capable of speaking Arabic, Roman Urdu, and English fluently based on the user's choice. " +
      "Keep responses helpful, professional, and concise.\n\n";
      
    if (needsGreeting) {
      systemInstruction += "LANGUAGE RULE: Because this is the first interaction today, you MUST include this exact message at the end of your response: '(We can talk in Arabic / Roman Urdu and English easily. If you want, you can select other language, otherwise continue in English)'.\n\n";
    }

    if (needsOnboarding && kb.onboardingPrompt) {
      systemInstruction += `WELCOME & ONBOARDING RULE:\n${kb.onboardingPrompt}\n\n`;
    }

    systemInstruction += "LEAD GENERATION RULE: Your secondary goal is to naturally collect the user's Name, Company Name, Major Products, Email address, and Website. Once the user provides any of these details, you MUST output a hidden tag at the very end of your response exactly like this: [LEAD: TheirName | TheirCompany | TheirProducts | TheirEmail | TheirWebsite]. Use 'N/A' for any details that have not been provided yet. Do not mention this tag to the user.\n\n";

    if (settings.RESTRICT_PRICING) {
      systemInstruction += "PRICING/RATE LIMIT RULE: You are STRICTLY FORBIDDEN from quoting rates, pricing, fees, or charges. If the user asks about prices or rates, you MUST politely say: 'I will have a representative message you with our current official pricing.'\n\n";
    }
    if (settings.BLOCK_COMPETITORS) {
      systemInstruction += "COMPETITOR LIMIT RULE: You are STRICTLY FORBIDDEN from discussing competitor companies or competitor rates. If the user mentions or asks about a competitor, you MUST politely state: 'I can only provide information about our own services.'\n\n";
    }

    // Fetch Custom Q&As
    let faqText = "";
    try {
      const faqSnap = await getDoc(doc(db, "appData", "faq"));
      if (faqSnap.exists() && faqSnap.data().faqs) {
        faqText = faqSnap.data().faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n");
      }
    } catch(err) {}

    systemInstruction += "### KNOWLEDGE BASE ###\n" + knowledgeBase;
    if (faqText) {
      systemInstruction += "\n\n### FREQUENTLY ASKED QUESTIONS (FAQ) ###\n" + faqText;
    }

    // Fetch Full Chat History
    const q = query(collection(db, "chats", senderNumber, "messages"), orderBy("timestamp", "asc"));
    const snapshot = await getDocs(q);
    const messages = snapshot.docs.map(d => d.data());

    // Build Gemini Contents (Merge consecutive roles to prevent errors)
    const geminiContents = [];
    let lastRole = "";
    messages.forEach(m => {
      const role = m.sender === "user" ? "user" : "model";
      if (role === lastRole) {
        geminiContents[geminiContents.length - 1].parts[0].text += "\n" + m.text;
      } else {
        geminiContents.push({ role: role, parts: [{text: m.text}] });
        lastRole = role;
      }
    });
    // Ensure we don't pass an empty contents array if for some reason it's empty
    if (geminiContents.length === 0) geminiContents.push({ role: "user", parts: [{text: userPrompt}] });

    // Build DeepSeek Messages
    const dsMessages = [{ role: "system", content: systemInstruction }];
    messages.slice(-50).forEach(m => {
      dsMessages.push({ role: m.sender === "user" ? "user" : "assistant", content: m.text });
    });

    let finalReply = "";

    if (provider === 'gemini') {
      const genAI = new GoogleGenerativeAI(settings.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
         model: "gemini-2.5-flash",
         systemInstruction: systemInstruction,
      });
      const result = await model.generateContent({ contents: geminiContents });
      finalReply = result.response.text();
    } else {
      const openai = new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: settings.DEEPSEEK_API_KEY
      });
      const completion = await openai.chat.completions.create({
        messages: dsMessages,
        model: "deepseek-chat",
        temperature: 0.7,
      });
      finalReply = completion.choices[0].message.content;
    }

    // Parse Lead Tag
    const leadMatch = finalReply.match(/\[LEAD:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\]/i);
    if (leadMatch) {
      const leadName = leadMatch[1].trim();
      const leadCompany = leadMatch[2].trim();
      const leadProducts = leadMatch[3].trim();
      const leadEmail = leadMatch[4].trim();
      const leadWebsite = leadMatch[5].trim();
      
      finalReply = finalReply.replace(leadMatch[0], '').trim();
      
      try {
        const cSnap = await getDoc(contactsRef);
        let cData = cSnap.exists() ? cSnap.data() : {};
        if (!cData[senderNumber]) cData[senderNumber] = {};
        
        if (leadName !== 'N/A' && leadName !== '') cData[senderNumber].leadName = leadName;
        if (leadCompany !== 'N/A' && leadCompany !== '') cData[senderNumber].leadCompany = leadCompany;
        if (leadProducts !== 'N/A' && leadProducts !== '') cData[senderNumber].leadProducts = leadProducts;
        if (leadEmail !== 'N/A' && leadEmail !== '') cData[senderNumber].leadEmail = leadEmail;
        if (leadWebsite !== 'N/A' && leadWebsite !== '') cData[senderNumber].leadWebsite = leadWebsite;
        
        await setDoc(contactsRef, cData);
      } catch(e) { console.error("Error saving lead info:", e); }
    }

    return finalReply;
  } catch (error) {
    console.error('AI API Error:', error);
    return "I apologize, but I encountered an issue while generating a reply. Please try again in a moment.";
  }
}

// --- API Endpoints ---
app.get('/', (req, res) => {
  res.send('WhatsApp AI Agent Webhook is active! <br> <a href="/admin.html">Go to Admin Dashboard</a>');
});

app.get('/api/env', async (req, res) => {
  const settings = await getSettings();
  res.json({
    ACTIVE_AI_PROVIDER: settings.ACTIVE_AI_PROVIDER || 'deepseek',
    DEEPSEEK_API_KEY: settings.DEEPSEEK_API_KEY || '',
    GEMINI_API_KEY: settings.GEMINI_API_KEY || '',
    WHATSAPP_TOKEN: settings.WHATSAPP_TOKEN || '',
    PHONE_NUMBER_ID: settings.PHONE_NUMBER_ID || '',
    VERIFY_TOKEN: settings.VERIFY_TOKEN || '',
    OWNER_PHONE_NUMBER: settings.OWNER_PHONE_NUMBER || '',
    RESTRICT_PRICING: settings.RESTRICT_PRICING === true,
    BLOCK_COMPETITORS: settings.BLOCK_COMPETITORS === true
  });
});

app.post('/api/env', async (req, res) => {
  try {
    const data = req.body;
    await setDoc(doc(db, "appData", "settings"), {
      ACTIVE_AI_PROVIDER: data.ACTIVE_AI_PROVIDER || 'deepseek',
      DEEPSEEK_API_KEY: data.DEEPSEEK_API_KEY || '',
      GEMINI_API_KEY: data.GEMINI_API_KEY || '',
      WHATSAPP_TOKEN: data.WHATSAPP_TOKEN || '',
      PHONE_NUMBER_ID: data.PHONE_NUMBER_ID || '',
      VERIFY_TOKEN: data.VERIFY_TOKEN || '',
      OWNER_PHONE_NUMBER: data.OWNER_PHONE_NUMBER || '',
      RESTRICT_PRICING: data.RESTRICT_PRICING === true,
      BLOCK_COMPETITORS: data.BLOCK_COMPETITORS === true
    }, { merge: true });
    res.json({ success: true, message: 'Settings saved to Database successfully.' });
  } catch (error) {
    console.error('Error saving settings to DB:', error);
    res.status(500).json({ error: 'Failed to save environment variables.' });
  }
});

// Pass through endpoints for Admin UI
app.get('/api/knowledge', async (req, res) => {
  try {
    const docSnap = await getDoc(doc(db, "appData", "knowledge"));
    res.json(docSnap.exists() ? docSnap.data() : {});
  } catch (error) { res.status(500).json({ error: 'Failed to load knowledge base.' }); }
});

app.post('/api/knowledge', async (req, res) => {
  try {
    await setDoc(doc(db, "appData", "knowledge"), req.body);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to save knowledge.' }); }
});

app.get('/api/faqs', async (req, res) => {
  try {
    const docSnap = await getDoc(doc(db, "appData", "faq"));
    res.json(docSnap.exists() ? docSnap.data().faqs || [] : []);
  } catch (error) { res.json([]); }
});

app.post('/api/faqs', async (req, res) => {
  try {
    await setDoc(doc(db, "appData", "faq"), { faqs: req.body.faqs || [] });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to save FAQs.' }); }
});

app.get('/api/contacts', async (req, res) => {
  try {
    const docSnap = await getDoc(doc(db, "appData", "contacts"));
    res.json(docSnap.exists() ? docSnap.data() : {});
  } catch (error) { res.json({}); }
});

app.get('/api/chats/:number/messages', async (req, res) => {
  try {
    const q = query(collection(db, "chats", req.params.number, "messages"), orderBy("timestamp", "asc"));
    const snapshot = await getDocs(q);
    res.json(snapshot.docs.map(d => d.data()));
  } catch (err) { res.status(500).json({error: "Failed to load messages"}); }
});

app.post('/api/chats/reply', async (req, res) => {
  try {
    const { number, text } = req.body;
    const settings = await getSettings();
    await sendWhatsAppMessage(number, text, settings);
    
    // Pause AI
    const contactsRef = doc(db, "appData", "contacts");
    const contactsSnap = await getDoc(contactsRef);
    let contacts = contactsSnap.exists() ? contactsSnap.data() : {};
    if (!contacts[number]) contacts[number] = {};
    contacts[number].aiPaused = true;
    await setDoc(contactsRef, contacts);
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({error: "Failed to send"}); }
});

app.post('/api/chats/toggleAI', async (req, res) => {
  try {
    const { number, aiPaused } = req.body;
    const contactsRef = doc(db, "appData", "contacts");
    const contactsSnap = await getDoc(contactsRef);
    let contacts = contactsSnap.exists() ? contactsSnap.data() : {};
    if (!contacts[number]) contacts[number] = {};
    contacts[number].aiPaused = aiPaused;
    await setDoc(contactsRef, contacts);
    res.json({ success: true });
  } catch (err) { res.status(500).json({error: "Failed to toggle"}); }
});

app.post('/api/scrape', async (req, res) => {
  try {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!url.startsWith('http')) url = 'https://' + url;

    // Fetch HTML
    const response = await axios.get(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: 15000
    });
    const html = response.data;

    // Parse text
    const $ = cheerio.load(html);
    $('script, style, noscript, iframe, img, svg').remove();
    const textContent = $('body').text().replace(/\s+/g, ' ').trim();

    // Save to Firestore
    const kbRef = doc(db, "appData", "knowledge");
    const docSnap = await getDoc(kbRef);
    const currentData = docSnap.exists() ? docSnap.data() : {};
    
    const currentScraped = currentData.scrapedData || '';
    const newData = `\n--- SOURCE: ${url} ---\n${textContent.substring(0, 5000)}`;
    const finalScraped = (currentScraped + newData).substring(0, 15000);

    await setDoc(kbRef, { ...currentData, scrapedData: finalScraped });

    res.json({ success: true });
  } catch (err) {
    console.error('Scraping error:', err.message);
    res.status(500).json({ error: `Website blocked the request: ${err.message}` });
  }
});

// --- Webhooks ---
app.get('/webhook', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const settings = await getSettings();

  if (mode && token) {
    if (mode === 'subscribe' && token === settings.VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.status(403).sendStatus(403);
    }
  }
  return res.status(400).send('Missing hub.mode or hub.verify_token');
});

app.post('/webhook', async (req, res) => {
  res.status(200).send('EVENT_RECEIVED'); // Quick ack
  
  try {
    const { body } = req;
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const message = entry?.changes?.[0]?.value?.messages?.[0];
      if (!message || message.type !== 'text') return;

      const senderNumber = message.from;
      const userText = message.text.body;
      const settings = await getSettings();

      // Log to Firestore
      try {
        await addDoc(collection(db, "chats", senderNumber, "messages"), {
          sender: "user",
          text: userText,
          timestamp: Date.now()
        });
      } catch(err) { console.error("Logging incoming error:", err); }

      // Proxy check
      if (settings.OWNER_PHONE_NUMBER && senderNumber === settings.OWNER_PHONE_NUMBER) {
        if (userText.toUpperCase().startsWith("REPLY ")) {
          const parts = userText.split(" ");
          const targetNumber = parts[1];
          const msgBody = parts.slice(2).join(" ");
          
          if (targetNumber && msgBody) {
            await sendWhatsAppMessage(targetNumber, msgBody, settings);
            
            // Pause AI
            const contactsRef = doc(db, "appData", "contacts");
            const contactsSnap = await getDoc(contactsRef);
            let contacts = contactsSnap.exists() ? contactsSnap.data() : {};
            if (!contacts[targetNumber]) contacts[targetNumber] = {};
            contacts[targetNumber].aiPaused = true;
            await setDoc(contactsRef, contacts);

            await sendWhatsAppMessage(senderNumber, `✅ Sent & AI Paused for ${targetNumber}.`, settings);
            return;
          }
        }
      }

      // Generate AI Reply
      const contactsRef = doc(db, "appData", "contacts");
      const contactsSnap = await getDoc(contactsRef);
      const contacts = contactsSnap.exists() ? contactsSnap.data() : {};
      
      if (!contacts[senderNumber] || !contacts[senderNumber].aiPaused) {
        const replyText = await generateAIResponse(userText, senderNumber, settings);
        await sendWhatsAppMessage(senderNumber, replyText, settings);
      }
    }
  } catch (error) {
    console.error('Webhook Error:', error.message);
  }
});

// --- Server Startup ---
// Local development only (prevents crashing during Firebase deployment analysis)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`WhatsApp AI Agent (Local) running on port ${PORT}`);
  });
}

// Export for Firebase Cloud Functions
// minInstances: 1 keeps the server ALWAYS WARM - eliminates cold start delays!
export const api = onRequest(
  {
    minInstances: 1,        // Always keep 1 server hot - no cold starts!
    memory: "512MiB",      // Enough RAM for Gemini + chat history processing
    timeoutSeconds: 60,    // Allow up to 60 seconds for AI to respond
    region: "us-central1"
  },
  app
);
