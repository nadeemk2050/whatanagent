package com.assigntask.app

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class AssignTaskApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (FirebaseApp.getApps(this).isEmpty()) {
            val options = FirebaseOptions.Builder()
                .setApiKey("AIzaSyDGhwmtpHazLrDWDXjK3WoGPh610mrJeaI")
                .setApplicationId("1:410197132578:android:a215fc3907e255c8df917b")
                .setProjectId("whatanagent-a1e59")
                .setStorageBucket("whatanagent-a1e59.firebasestorage.app")
                .setGcmSenderId("410197132578")
                .build()
            FirebaseApp.initializeApp(this, options)
        }
    }
}
