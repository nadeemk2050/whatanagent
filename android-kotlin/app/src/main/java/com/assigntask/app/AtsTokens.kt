package com.assigntask.app

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * ATS design tokens — a 1:1 port of the AlignTasks PWA's `:root` variables.
 *
 * The web app is the single source of truth for the look, so every value here cites the CSS token
 * it mirrors. Screens must take colours from here (never hard-code hex) so the phone and the
 * browser can never drift apart.
 *
 *   --ats-bg        #f6efe0     --ats-card      #fffdf8
 *   --ats-bg-2      #fdfaf3     --ats-charcoal  #34373d
 *   --ats-bar-1     #ececed     --ats-gold      #b08d3f
 *   --ats-bar-2     #d6d7db     --ats-gold-soft #d9bd7d
 *   --ats-line      #d5cfc2     --ats-ink       #1f2126
 *   --ats-ink-soft  #5c6169
 */
object Ats {
    // --- surfaces -----------------------------------------------------------
    val bg = Color(0xFFF6EFE0)          // --ats-bg        page background
    val bg2 = Color(0xFFFDFAF3)         // --ats-bg-2      raised areas / inputs
    val bar1 = Color(0xFFECECED)        // --ats-bar-1     top bar metal, light end
    val bar2 = Color(0xFFD6D7DB)        // --ats-bar-2     top bar metal, dark end
    val card = Color(0xFFFFFDF8)        // --ats-card      cards, sheets, menus
    val line = Color(0xFFD5CFC2)        // --ats-line      every border

    // --- ink ----------------------------------------------------------------
    val ink = Color(0xFF1F2126)         // --ats-ink       primary text
    val inkSoft = Color(0xFF5C6169)     // --ats-ink-soft  secondary text

    // --- brand --------------------------------------------------------------
    val gold = Color(0xFFB08D3F)        // --ats-gold      primary accent
    val goldSoft = Color(0xFFD9BD7D)    // --ats-gold-soft champagne highlight
    val charcoal = Color(0xFF34373D)    // --ats-charcoal  section pill, dark buttons

    // --- support ------------------------------------------------------------
    val ok = Color(0xFF15803D)
    val warn = Color(0xFFB45309)
    val danger = Color(0xFFB00020)
    val chipBg = Color(0xFFE5E7EB)      // the pill capsule behind the section switcher
    val countBg = Color(0xFFEFE3C8)     // -- count badge behind "All / 12"
    val countInk = Color(0xFF6B5F45)
    val noticeBg = Color(0xFFFFF7ED)    // the amber "no team yet" strip
    val noticeInk = Color(0xFF9A3412)

    /** The brushed-titanium top bar: 180deg linear gradient of bar-1 -> bar-2. */
    val barBrush = Brush.verticalGradient(listOf(bar1, bar2))

    /** The brass name plate used for office doors / profile chips. */
    val brassBrush = Brush.verticalGradient(listOf(goldSoft, gold))

    // --- geometry -----------------------------------------------------------
    val pillShape = RoundedCornerShape(9.dp)
    val cardShape = RoundedCornerShape(14.dp)
    val sheetShape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp)
    val hairline = 1.dp
}

private val AtsColorScheme = lightColorScheme(
    primary = Ats.charcoal,
    onPrimary = Ats.card,
    primaryContainer = Ats.goldSoft,
    onPrimaryContainer = Ats.ink,
    secondary = Ats.gold,
    onSecondary = Color.White,
    tertiary = Ats.goldSoft,
    onTertiary = Ats.ink,
    background = Ats.bg,
    onBackground = Ats.ink,
    surface = Ats.card,
    onSurface = Ats.ink,
    surfaceVariant = Ats.bg2,
    onSurfaceVariant = Ats.inkSoft,
    outline = Ats.line,
    outlineVariant = Ats.bar2,
    error = Ats.danger,
    onError = Color.White
)

private val AtsTypography = Typography(
    titleLarge = TextStyle(fontWeight = FontWeight.ExtraBold, fontSize = 19.sp, letterSpacing = (-0.3).sp),
    titleMedium = TextStyle(fontWeight = FontWeight.Bold, fontSize = 15.sp),
    titleSmall = TextStyle(fontWeight = FontWeight.Bold, fontSize = 13.sp),
    bodyMedium = TextStyle(fontSize = 13.5.sp),
    bodySmall = TextStyle(fontSize = 12.sp),
    labelSmall = TextStyle(fontWeight = FontWeight.Bold, fontSize = 10.sp, letterSpacing = 0.6.sp)
)

/** Wraps the whole app in the ATS palette, so every existing screen adopts it at once. */
@Composable
fun AtsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AtsColorScheme,
        typography = AtsTypography,
        content = content
    )
}
