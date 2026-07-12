# WhatsApp AI Agent (Day 1 & Day 2 Prototype)

This is a working prototype of an e-commerce WhatsApp AI Agent. It uses **Node.js (Express)** to handle incoming Webhook events from Meta's WhatsApp Cloud API, queries the **Google Gemini API** (using `gemini-2.5-flash`) to generate intelligent replies, and sends them back to the user's WhatsApp number.

---

## 🚀 Setup & Installation

### 1. Prerequisites
- [Node.js](https://nodejs.org/) installed on your machine.
- A [Meta for Developers](https://developers.facebook.com/) account.
- A [Google AI Studio](https://aistudio.google.com/) account for a free Gemini API key.
- [ngrok](https://ngrok.com/) or another tunneling tool to expose your local server to the internet.

### 2. Install Dependencies
Run the following command inside the project directory:
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
copy .env.example .env
```
Fill in the values in `.env`:
- `GEMINI_API_KEY`: Get a free key from Google AI Studio.
- `VERIFY_TOKEN`: A custom random string of your choice (e.g. `my_super_secret_token_123`).
- `WHATSAPP_TOKEN`: Meta WhatsApp Temporary or Permanent Access Token.
- `PHONE_NUMBER_ID`: Meta Developer Console Phone ID.

---

## 🌐 Exposing and Verifying Webhook

Meta requires your webhook to be accessible via `https`.

1. **Start the local server**:
   ```bash
   npm run dev
   ```
   *The server runs on port 3000 by default.*

2. **Start ngrok tunnel**:
   In a separate terminal, expose port 3000:
   ```bash
   ngrok http 3000
   ```
   Copy the secure forwarding URL (e.g., `https://xxxx-xx-xx.ngrok-free.app`).

3. **Configure Meta Webhook**:
   - Go to your app in the **Meta Developers Portal**.
   - Under **WhatsApp -> Configuration**, click **Edit Webhook**.
   - **Callback URL**: paste your ngrok URL followed by `/webhook` (e.g. `https://xxxx-xx-xx.ngrok-free.app/webhook`).
   - **Verify Token**: paste the exact string you configured as `VERIFY_TOKEN` in your `.env` file.
   - Click **Verify and Save**.

4. **Subscribe to Webhook Fields**:
   - Under **Webhook fields** in Meta Developers Portal, find **messages** and click **Subscribe**.

---

## 🛠️ Development & customisation

- **AI Persona**: You can modify the system instructions for the AI agent in `index.js` under the `generateAIResponse` function.
- **Handling Images / Audio**: We can extend the receiver under `POST /webhook` to handle media and process them using Gemini.
