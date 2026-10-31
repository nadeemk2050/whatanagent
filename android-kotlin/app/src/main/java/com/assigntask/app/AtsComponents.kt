@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.assigntask.app


import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The shared ATS chrome. Every one of these mirrors a piece of the PWA so screens stay consistent:
 *   AtsTopBar   -> #ats-nav-block (section pill + view pill + account menu)
 *   AtsSheet    -> .modal overlay (the PWA's dialogs)
 *   AtsCard     -> .card
 *   AtsStatChip -> #personal-stat-*
 */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AtsTopBar(
    title: String,
    viewLabel: String,
    viewCount: Int,
    onMenu: () -> Unit,
    onSection: (BoardSection) -> Unit,
    onView: (TaskView) -> Unit,
    onAccount: (MenuEntry) -> Unit,
    onSearch: (() -> Unit)? = null,
    showViewPill: Boolean = true,
    // Board pages draw their own header, so the section pill + search here would duplicate it.
    showSectionPill: Boolean = true
) {
    var sectionOpen by remember { mutableStateOf(false) }
    var viewOpen by remember { mutableStateOf(false) }
    var accountOpen by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxWidth().background(Ats.barBrush)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onMenu) { Icon(Icons.Default.Menu, "Menu", tint = Ats.ink) }

            // ---- section pill (charcoal, white text) --------------------------
            if (showSectionPill) Box {
                Row(
                    modifier = Modifier
                        .background(Ats.chipBg, RoundedCornerShape(11.dp))
                        .padding(3.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        modifier = Modifier
                            .background(Ats.charcoal, Ats.pillShape)
                            .clickable { sectionOpen = true }
                            .padding(horizontal = 10.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            title,
                            color = Ats.card,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 12.5.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.widthIn(max = 150.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Icon(Icons.Default.KeyboardArrowDown, "Switch section", tint = Ats.card, modifier = Modifier.size(15.dp))
                    }
                    if (onSearch != null) {
                        IconButton(onClick = onSearch, modifier = Modifier.size(30.dp)) {
                            Icon(Icons.Default.Search, "Search", tint = Ats.inkSoft, modifier = Modifier.size(17.dp))
                        }
                    }
                }
                DropdownMenu(expanded = sectionOpen, onDismissRequest = { sectionOpen = false }) {
                    BoardSection.entries.forEach { s ->
                        DropdownMenuItem(
                            text = { Text(s.label, fontWeight = if (s.label == title) FontWeight.Bold else FontWeight.Normal) },
                            onClick = { sectionOpen = false; onSection(s) }
                        )
                    }
                }
            }

            if (showViewPill) {
                Spacer(Modifier.width(6.dp))
                // ---- view pill (All / Today / Overdue / Completed + count) ----
                Box {
                    Row(
                        modifier = Modifier
                            .background(Ats.bg2, RoundedCornerShape(10.dp))
                            .border(Ats.hairline, Ats.line, RoundedCornerShape(10.dp))
                            .clickable { viewOpen = true }
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(viewLabel, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, color = Ats.ink, maxLines = 1)
                        Spacer(Modifier.width(6.dp))
                        Box(
                            modifier = Modifier.background(Ats.countBg, CircleShape).padding(horizontal = 6.dp, vertical = 1.dp)
                        ) {
                            Text("$viewCount", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Ats.countInk)
                        }
                        Spacer(Modifier.width(3.dp))
                        Icon(Icons.Default.KeyboardArrowDown, "Filter", tint = Ats.inkSoft, modifier = Modifier.size(13.dp))
                    }
                    DropdownMenu(expanded = viewOpen, onDismissRequest = { viewOpen = false }) {
                        TaskView.menu.forEach { v ->
                            DropdownMenuItem(
                                text = { Text(v.label, fontWeight = if (v.label == viewLabel) FontWeight.Bold else FontWeight.Normal) },
                                onClick = { viewOpen = false; onView(v) }
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.weight(1f))

            // ---- account menu, same order and separators as the PWA ----------
            Box {
                IconButton(onClick = { accountOpen = true }) {
                    Icon(Icons.Default.Person, "Account", tint = Ats.ink)
                }
                DropdownMenu(expanded = accountOpen, onDismissRequest = { accountOpen = false }) {
                    var lastGroup = -1
                    MenuEntry.menu.forEach { item ->
                        if (lastGroup != -1 && item.sectionGroup != lastGroup) HorizontalDivider(color = Ats.line)
                        lastGroup = item.sectionGroup
                        DropdownMenuItem(
                            text = {
                                Text(
                                    item.label,
                                    color = if (item.danger) Ats.danger else Ats.ink,
                                    fontWeight = if (item == MenuEntry.PERSONAL_TASKS) FontWeight.Bold else FontWeight.Normal
                                )
                            },
                            onClick = { accountOpen = false; onAccount(item) }
                        )
                    }
                }
            }
        }
    }
}

/** The amber strip the PWA shows above the board (no team, offline, etc.). */
@Composable
fun AtsNotice(text: String, onClose: (() -> Unit)? = null) {
    Row(
        modifier = Modifier.fillMaxWidth().background(Ats.noticeBg).padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text, color = Ats.noticeInk, fontSize = 12.sp, modifier = Modifier.weight(1f))
        if (onClose != null) TextButton(onClick = onClose) { Text("OK", color = Ats.noticeInk) }
    }
}

@Composable
fun AtsCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(Ats.card, Ats.cardShape)
            .border(Ats.hairline, Ats.line, Ats.cardShape)
            .padding(14.dp)
    ) { content() }
}

/** One of the four personal counters (Total / To Do / Done / Urgent). */
@Composable
fun AtsStatChip(label: String, value: Int, tint: androidx.compose.ui.graphics.Color = Ats.ink) {
    Column(
        modifier = Modifier
            .background(Ats.bg2, RoundedCornerShape(12.dp))
            .border(Ats.hairline, Ats.line, RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("$value", fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = tint)
        Text(label, fontSize = 10.sp, color = Ats.inkSoft, maxLines = 1)
    }
}

@Composable
fun AtsEmpty(title: String, hint: String) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 34.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(title, fontWeight = FontWeight.Bold, color = Ats.inkSoft, fontSize = 14.sp)
        Text(hint, color = Ats.inkSoft, fontSize = 12.sp)
    }
}

/**
 * A bottom sheet styled like the PWA's dialogs: ivory card, gold title rule, actions on the right.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AtsSheet(
    title: String,
    onDismiss: () -> Unit,
    confirmLabel: String = "Save",
    onConfirm: (() -> Unit)? = null,
    destructive: Boolean = false,
    content: @Composable () -> Unit
) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        containerColor = Ats.card,
        shape = Ats.sheetShape
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 22.dp)) {
            Text(title, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = Ats.ink)
            Box(
                modifier = Modifier
                    .padding(top = 8.dp)
                    .width(46.dp)
                    .height(3.dp)
                    .background(Ats.brassBrush, RoundedCornerShape(2.dp))
            )
            Spacer(Modifier.height(14.dp))
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) { content() }
            if (onConfirm != null) {
                Spacer(Modifier.height(16.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Cancel", color = Ats.inkSoft) }
                    Spacer(Modifier.width(6.dp))
                    TextButton(onClick = onConfirm) {
                        Text(confirmLabel, color = if (destructive) Ats.danger else Ats.gold, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
