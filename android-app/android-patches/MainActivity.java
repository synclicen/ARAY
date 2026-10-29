package com.aray.booth;

import android.os.Bundle;
import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int CAMERA_PERMISSION_REQUEST = 1001;
    private static final int STORAGE_PERMISSION_REQUEST = 1002;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // v4.7.3: Register native DriveBackup plugin BEFORE super.onCreate
        // Plugin uses Android Storage Access Framework (SAF) for Google Drive
        // auto-upload — same approach as Saatiril-Andro
        registerPlugin(DriveBackupPlugin.class);
        // v4.7.42: Register native Camera2 plugin for USB capture card support
        registerPlugin(Camera2NativePlugin.class);

        super.onCreate(savedInstanceState);

        // Request camera permission at startup — required for getUserMedia() in WebView
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                new String[] { Manifest.permission.CAMERA },
                CAMERA_PERMISSION_REQUEST);
        }

        // v4.7.0: Request storage permissions for Documents/ARAY folder access
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                    new String[] {
                        Manifest.permission.WRITE_EXTERNAL_STORAGE,
                        Manifest.permission.READ_EXTERNAL_STORAGE
                    },
                    STORAGE_PERMISSION_REQUEST);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_REQUEST) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            android.util.Log.i("ARAY", "Camera permission granted: " + granted);
        } else if (requestCode == STORAGE_PERMISSION_REQUEST) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            android.util.Log.i("ARAY", "Storage permission granted: " + granted);
        }
    }
}

