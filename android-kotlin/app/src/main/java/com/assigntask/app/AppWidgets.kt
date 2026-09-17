package com.assigntask.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViewsService
import android.widget.RemoteViews
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val WEB_APP_ID = "1:410197132578:web:97cfc3ae33f39ed3df917b"
private const val BASE = "/artifacts/$WEB_APP_ID/public/data"
private const val ACTION_TOGGLE_TASK = "com.assigntask.app.TOGGLE_TASK"
private const val EXTRA_WIDGET_MODE = "extra_widget_mode"
private const val EXTRA_TASK_ID = "extra_task_id"
private const val EXTRA_TASK_TYPE = "extra_task_type"
private const val EXTRA_PROJECT_ID = "extra_project_id"

private const val MODE_TASKS_FOR_ALL = "tasks_for_all"
private const val MODE_PROJECT_TASKS = "project_tasks"
private const val MODE_DAY_TIMETABLE = "day_timetable"

data class WidgetTaskItem(
    val id: String,
    val title: String,
    val dueText: String,
    val taskType: String,
    val projectId: String?,
    val isDone: Boolean
)

class TaskOverviewWidgetProvider : BaseTaskWidgetProvider(MODE_TASKS_FOR_ALL)
class ProjectTasksWidgetProvider : BaseTaskWidgetProvider(MODE_PROJECT_TASKS)
class TodayPlannerWidgetProvider : BaseTaskWidgetProvider(MODE_DAY_TIMETABLE)

open class BaseTaskWidgetProvider(private val mode: String) : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetIds.forEach { id ->
            val layout = when (mode) {
                MODE_TASKS_FOR_ALL -> R.layout.widget_task_overview
                MODE_PROJECT_TASKS -> R.layout.widget_project_tasks
                else -> R.layout.widget_today_planner
            }
            val views = RemoteViews(context.packageName, layout)

            views.setTextViewText(R.id.widget_header_date, SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(Date()))

            val serviceIntent = Intent(context, TaskListWidgetService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
                putExtra(EXTRA_WIDGET_MODE, mode)
            }
            views.setRemoteAdapter(R.id.widget_list, serviceIntent)
            views.setEmptyView(R.id.widget_list, R.id.widget_empty)

            val clickIntentTemplate = Intent(context, BaseTaskWidgetProvider::class.java).apply {
                action = ACTION_TOGGLE_TASK
            }
            val pendingTemplate = PendingIntent.getBroadcast(
                context,
                id,
                clickIntentTemplate,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setPendingIntentTemplate(R.id.widget_list, pendingTemplate)

            val openPlanner = openPagePendingIntent(context, "planner", 500 + id)
            views.setOnClickPendingIntent(R.id.widget_header_title, openPlanner)

            appWidgetManager.updateAppWidget(id, views)
            appWidgetManager.notifyAppWidgetViewDataChanged(id, R.id.widget_list)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_TOGGLE_TASK) {
            val taskId = intent.getStringExtra(EXTRA_TASK_ID).orEmpty()
            val taskType = intent.getStringExtra(EXTRA_TASK_TYPE).orEmpty()
            val projectId = intent.getStringExtra(EXTRA_PROJECT_ID)
            if (taskId.isNotBlank() && taskType.isNotBlank()) {
                WidgetDataRepository.markTaskDone(taskId, taskType, projectId)
                val manager = AppWidgetManager.getInstance(context)
                manager.notifyAppWidgetViewDataChanged(
                    manager.getAppWidgetIds(android.content.ComponentName(context, TaskOverviewWidgetProvider::class.java)),
                    R.id.widget_list
                )
                manager.notifyAppWidgetViewDataChanged(
                    manager.getAppWidgetIds(android.content.ComponentName(context, ProjectTasksWidgetProvider::class.java)),
                    R.id.widget_list
                )
                manager.notifyAppWidgetViewDataChanged(
                    manager.getAppWidgetIds(android.content.ComponentName(context, TodayPlannerWidgetProvider::class.java)),
                    R.id.widget_list
                )
            }
        }
    }
}

class TaskListWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return TaskListRemoteViewsFactory(applicationContext, intent)
    }
}

class TaskListRemoteViewsFactory(private val context: Context, intent: Intent) : RemoteViewsService.RemoteViewsFactory {
    private val mode: String = intent.getStringExtra(EXTRA_WIDGET_MODE).orEmpty()
    private val items = mutableListOf<WidgetTaskItem>()

    override fun onCreate() {}

    override fun onDataSetChanged() {
        items.clear()
        items += when (mode) {
            MODE_PROJECT_TASKS -> WidgetDataRepository.loadProjectTasks(context)
            MODE_DAY_TIMETABLE -> WidgetDataRepository.loadTodayTimetable(context)
            else -> WidgetDataRepository.loadTasksForAll(context)
        }
    }

    override fun onDestroy() {
        items.clear()
    }

    override fun getCount(): Int = items.size

    override fun getViewAt(position: Int): RemoteViews {
        if (position !in items.indices) return RemoteViews(context.packageName, R.layout.widget_task_row)
        val item = items[position]
        val views = RemoteViews(context.packageName, R.layout.widget_task_row)
        views.setTextViewText(R.id.widget_row_title, item.title)
        views.setTextViewText(R.id.widget_row_subtitle, item.dueText)
        views.setImageViewResource(
            R.id.widget_row_check,
            if (item.isDone) android.R.drawable.checkbox_on_background else android.R.drawable.checkbox_off_background
        )

        val fillIntent = Intent().apply {
            putExtra(EXTRA_TASK_ID, item.id)
            putExtra(EXTRA_TASK_TYPE, item.taskType)
            putExtra(EXTRA_PROJECT_ID, item.projectId)
        }
        views.setOnClickFillInIntent(R.id.widget_row_check, fillIntent)
        return views
    }

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 1
    override fun getItemId(position: Int): Long = items.getOrNull(position)?.id?.hashCode()?.toLong() ?: position.toLong()
    override fun hasStableIds(): Boolean = true
}

object WidgetDataRepository {
    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()

    fun loadTasksForAll(context: Context): List<WidgetTaskItem> {
        val user = auth.currentUser ?: return emptyList()
        val docs = Tasks.await(db.collection("$BASE/tasks_for_all").get()).documents
        return docs.mapNotNull { doc ->
            val status = doc.getString("status") ?: "To Do"
            if (status == "Done") return@mapNotNull null
            WidgetTaskItem(
                id = doc.id,
                title = doc.getString("description") ?: "",
                dueText = formatDueLabel(doc.getString("dueDate")),
                taskType = "tasks_for_all",
                projectId = null,
                isDone = status == "Done"
            )
        }
    }

    fun loadProjectTasks(context: Context): List<WidgetTaskItem> {
        val user = auth.currentUser ?: return emptyList()
        val (projectId, projectName) = AppSettingsStore.getWidgetProjectSelection(context)
        if (projectId.isBlank()) return emptyList()
        val docs = Tasks.await(db.collection("$BASE/projects/$projectId/tasks").get()).documents
        return docs.mapNotNull { doc ->
            val status = doc.getString("status") ?: "To Do"
            if (status == "Done") return@mapNotNull null
            WidgetTaskItem(
                id = doc.id,
                title = (doc.getString("description") ?: "") + if (projectName.isNotBlank()) " [$projectName]" else "",
                dueText = formatDueLabel(doc.getString("dueDate")),
                taskType = "project",
                projectId = projectId,
                isDone = status == "Done"
            )
        }
    }

    fun loadTodayTimetable(context: Context): List<WidgetTaskItem> {
        val user = auth.currentUser ?: return emptyList()
        val today = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(Date())
        val items = mutableListOf<WidgetTaskItem>()

        try {
            val personal = Tasks.await(db.collection("$BASE/tasks").whereEqualTo("assigneeEmail", user.email).get()).documents
            personal.forEach { doc ->
                val status = doc.getString("status") ?: "To Do"
                val due = doc.getString("dueDate").orEmpty()
                if (status != "Done" && due.startsWith(today)) {
                    items += WidgetTaskItem(doc.id, doc.getString("description") ?: "", formatDueLabel(due), "tasks", null, false)
                }
            }
        } catch (e: Exception) {
            // Silently handle query failures (e.g., Firestore rules may block)
        }

        try {
            val allForAll = Tasks.await(db.collection("$BASE/tasks_for_all").get()).documents
            allForAll.forEach { doc ->
                val status = doc.getString("status") ?: "To Do"
                val due = doc.getString("dueDate").orEmpty()
                if (status != "Done" && due.startsWith(today)) {
                    items += WidgetTaskItem(doc.id, doc.getString("description") ?: "", formatDueLabel(due), "tasks_for_all", null, false)
                }
            }
        } catch (e: Exception) {
            // Silently handle query failures
        }

        return items.sortedBy { it.dueText }
    }

    fun markTaskDone(taskId: String, taskType: String, projectId: String?) {
        val userEmail = auth.currentUser?.email.orEmpty()
        val docRef = if (taskType == "project" && !projectId.isNullOrBlank()) {
            db.collection("$BASE/projects/$projectId/tasks").document(taskId)
        } else {
            db.collection("$BASE/$taskType").document(taskId)
        }
        docRef.update(
            mapOf(
                "status" to "Done",
                "completedBy" to userEmail,
                "completedAt" to FieldValue.serverTimestamp(),
                "lastUpdatedBy" to userEmail,
                "lastUpdatedAt" to FieldValue.serverTimestamp()
            )
        )
    }

    private fun formatDueLabel(value: String?): String {
        if (value.isNullOrBlank()) return "No due date"
        return value
    }
}

private fun openPagePendingIntent(context: Context, page: String, requestCode: Int): PendingIntent {
    val intent = Intent(context, MainActivity::class.java).apply {
        putExtra(MainActivity.EXTRA_OPEN_PAGE, page)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    return PendingIntent.getActivity(
        context,
        requestCode,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
}
