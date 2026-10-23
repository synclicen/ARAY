package com.aray.booth;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.database.Cursor;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * ARAY Storage Plugin — Native Android Storage Access Framework (SAF).
 *
 * Port dari Saatiril-Andro DriveBackupManager.kt + UploadQueueStore.kt
 *
 * v4.7.9: SQLite-backed upload queue (bukan SharedPreferences) — reliable,
 * survive app restart, support retry with backoff.
 *
 * DUA fungsi utama:
 * 1. LOCAL STORAGE — user pilih folder di HP untuk simpan foto lokal
 * 2. GOOGLE DRIVE BACKUP — user pilih folder Google Drive untuk auto-upload
 *    dengan SQLite queue + retry
 */
@CapacitorPlugin(name = "DriveBackup")
public class DriveBackupPlugin extends Plugin {
    private static final String TAG = "DriveBackupPlugin";
    private static final String PREFS_NAME = "aray_drive_prefs";
    private static final String KEY_DRIVE_URI = "backup_folder_uri";
    private static final String KEY_LOCAL_URI = "local_folder_uri";
    private static final String MIME_JPEG = "image/jpeg";
    private static final String MIME_VIDEO = "video/webm";

    private UploadQueueDb queueDb;

    @Override
    public void load() {
        super.load();
        // Initialize SQLite queue database
        try {
            queueDb = new UploadQueueDb(getContext());
            Log.i(TAG, "Upload queue database initialized");
        } catch (Exception e) {
            Log.e(TAG, "Failed to init upload queue DB: " + e.getMessage(), e);
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SQLite Upload Queue (port dari Saatiril-Andro UploadQueueStore.kt)
    // ════════════════════════════════════════════════════════════════════════

    private static class UploadQueueDb extends SQLiteOpenHelper {
        private static final String DB_NAME = "aray_upload_queue.db";
        private static final int DB_VERSION = 1;
        private static final String TABLE = "upload_queue";
        private static final String COL_ID = "id";
        private static final String COL_FILENAME = "filename";
        private static final String COL_LOCAL_URI = "local_uri";
        private static final String COL_PROJECT_NAME = "project_name";
        private static final String COL_MIME_TYPE = "mime_type";
        private static final String COL_STATUS = "status";
        private static final String COL_RETRY_COUNT = "retry_count";
        private static final String COL_CREATED_AT = "created_at";
        private static final String COL_UPLOADED_AT = "uploaded_at";
        private static final String COL_ERROR = "error";

        static final String STATUS_PENDING = "pending";
        static final String STATUS_UPLOADING = "uploading";
        static final String STATUS_DONE = "done";
        static final String STATUS_FAILED = "failed";

        private static final int MAX_RETRIES = 5;

        UploadQueueDb(Context context) {
            super(context, DB_NAME, null, DB_VERSION);
            getReadableDatabase(); // trigger onCreate
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE " + TABLE + " (" +
                    COL_ID + " INTEGER PRIMARY KEY AUTOINCREMENT," +
                    COL_FILENAME + " TEXT NOT NULL," +
                    COL_LOCAL_URI + " TEXT NOT NULL," +
                    COL_PROJECT_NAME + " TEXT NOT NULL," +
                    COL_MIME_TYPE + " TEXT NOT NULL DEFAULT 'image/jpeg'," +
                    COL_STATUS + " TEXT NOT NULL DEFAULT '" + STATUS_PENDING + "'," +
                    COL_RETRY_COUNT + " INTEGER NOT NULL DEFAULT 0," +
                    COL_CREATED_AT + " INTEGER NOT NULL," +
                    COL_UPLOADED_AT + " INTEGER," +
                    COL_ERROR + " TEXT)");
            db.execSQL("CREATE INDEX idx_status ON " + TABLE + " (" + COL_STATUS + ")");
            db.execSQL("CREATE INDEX idx_project ON " + TABLE + " (" + COL_PROJECT_NAME + ")");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            // Future migrations
        }

        long enqueue(String filename, String localUri, String projectName, String mimeType) {
            ContentValues values = new ContentValues();
            values.put(COL_FILENAME, filename);
            values.put(COL_LOCAL_URI, localUri);
            values.put(COL_PROJECT_NAME, projectName);
            values.put(COL_MIME_TYPE, mimeType);
            values.put(COL_STATUS, STATUS_PENDING);
            values.put(COL_RETRY_COUNT, 0);
            values.put(COL_CREATED_AT, System.currentTimeMillis());
            long id = getWritableDatabase().insertWithOnConflict(TABLE, null, values, SQLiteDatabase.CONFLICT_REPLACE);
            Log.i(TAG, "Enqueued: " + filename + " (id=" + id + ")");
            return id;
        }

        Cursor dequeueCursor() {
            return getReadableDatabase().query(TABLE, null,
                    COL_STATUS + " = ?", new String[]{STATUS_PENDING},
                    null, null, COL_ID + " ASC", "1");
        }

        void markUploading(long id) {
            ContentValues values = new ContentValues();
            values.put(COL_STATUS, STATUS_UPLOADING);
            getWritableDatabase().update(TABLE, values, COL_ID + " = ?", new String[]{String.valueOf(id)});
        }

        void markDone(long id) {
            ContentValues values = new ContentValues();
            values.put(COL_STATUS, STATUS_DONE);
            values.put(COL_UPLOADED_AT, System.currentTimeMillis());
            getWritableDatabase().delete(TABLE, COL_ID + " = ?", new String[]{String.valueOf(id)});
        }

        void markFailed(long id, String error) {
            Cursor cursor = getReadableDatabase().query(TABLE, new String[]{COL_RETRY_COUNT},
                    COL_ID + " = ?", new String[]{String.valueOf(id)},
                    null, null, null);
            int retryCount = 0;
            if (cursor != null && cursor.moveToFirst()) {
                retryCount = cursor.getInt(0);
                cursor.close();
            }
            ContentValues values = new ContentValues();
            values.put(COL_ERROR, error);
            if (retryCount + 1 >= MAX_RETRIES) {
                values.put(COL_STATUS, STATUS_FAILED);
                values.put(COL_RETRY_COUNT, retryCount + 1);
            } else {
                values.put(COL_STATUS, STATUS_PENDING);
                values.put(COL_RETRY_COUNT, retryCount + 1);
            }
            getWritableDatabase().update(TABLE, values, COL_ID + " = ?", new String[]{String.valueOf(id)});
        }

        void resetStuckItems() {
            ContentValues values = new ContentValues();
            values.put(COL_STATUS, STATUS_PENDING);
            int count = getWritableDatabase().update(TABLE, values,
                    COL_STATUS + " = ?", new String[]{STATUS_UPLOADING});
            if (count > 0) Log.i(TAG, "Reset " + count + " stuck UPLOADING items");
        }

        void retryAllFailed() {
            ContentValues values = new ContentValues();
            values.put(COL_STATUS, STATUS_PENDING);
            values.put(COL_RETRY_COUNT, 0);
            values.putNull(COL_ERROR);
            int count = getWritableDatabase().update(TABLE, values,
                    COL_STATUS + " = ?", new String[]{STATUS_FAILED});
            Log.i(TAG, "Retried " + count + " failed uploads");
        }

        int countByStatus(String status) {
            Cursor cursor = getReadableDatabase().rawQuery(
                    "SELECT COUNT(*) FROM " + TABLE + " WHERE " + COL_STATUS + " = ?",
                    new String[]{status});
            int count = 0;
            if (cursor != null && cursor.moveToFirst()) {
                count = cursor.getInt(0);
                cursor.close();
            }
            return count;
        }

        int getTotalUploaded() {
            // Track via separate counter table (like Saatiril)
            try {
                Cursor cursor = getReadableDatabase().rawQuery(
                        "SELECT count FROM upload_counter WHERE type = 'uploaded'", null);
                int count = 0;
                if (cursor != null && cursor.moveToFirst()) {
                    count = cursor.getInt(0);
                    cursor.close();
                }
                return count;
            } catch (Exception e) {
                return 0;
            }
        }

        void incrementUploaded() {
            try {
                getWritableDatabase().execSQL(
                        "CREATE TABLE IF NOT EXISTS upload_counter (type TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)");
                getWritableDatabase().execSQL(
                        "INSERT OR REPLACE INTO upload_counter (type, count) VALUES ('uploaded', COALESCE((SELECT count FROM upload_counter WHERE type='uploaded'), 0) + 1)");
            } catch (Exception e) {
                Log.w(TAG, "incrementUploaded error: " + e.getMessage());
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // LOCAL STORAGE
    // ════════════════════════════════════════════════════════════════════════

    @PluginMethod
    public void pickLocalFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "handleLocalFolderPick");
    }

    @ActivityCallback
    public void handleLocalFolderPick(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("User canceled local folder selection");
            return;
        }
        Uri treeUri = result.getData() != null ? result.getData().getData() : null;
        if (treeUri == null) {
            call.reject("No folder selected");
            return;
        }
        try {
            int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
        } catch (SecurityException e) {
            Log.w(TAG, "Could not take persistable permission: " + e.getMessage());
        }
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_LOCAL_URI, treeUri.toString()).apply();
        Log.i(TAG, "Local folder set: " + treeUri);

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("uri", treeUri.toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void hasLocalFolder(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uri = prefs.getString(KEY_LOCAL_URI, null);
        JSObject ret = new JSObject();
        ret.put("hasFolder", uri != null);
        ret.put("uri", uri != null ? uri : "");
        call.resolve(ret);
    }

    @PluginMethod
    public void clearLocalFolder(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().remove(KEY_LOCAL_URI).apply();
        call.resolve();
    }

    @PluginMethod
    public void saveLocalFile(PluginCall call) {
        String base64Data = call.getString("base64Data");
        String filename = call.getString("filename");
        String subfolder = call.getString("subfolder", "");
        String mimeType = call.getString("mimeType", MIME_JPEG);

        if (base64Data == null || filename == null) {
            call.reject("base64Data and filename required");
            return;
        }

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String treeUriStr = prefs.getString(KEY_LOCAL_URI, null);
        if (treeUriStr == null) {
            call.reject("No local folder set — call pickLocalFolder first");
            return;
        }

        try {
            Uri treeUri = Uri.parse(treeUriStr);
            DocumentFile rootDocFile = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (rootDocFile == null || !rootDocFile.canWrite()) {
                call.reject("Cannot access local folder — may need to re-select");
                return;
            }

            // Structure: Events/<EventName>/Photos/ or Videos/
            DocumentFile parentFolder = rootDocFile;
            if (subfolder != null && !subfolder.isEmpty()) {
                String sanitizedName = subfolder.replaceAll("[^a-zA-Z0-9_\\-\\s]", "").replaceAll("\\s+", "_");
                if (!sanitizedName.isEmpty()) {
                    DocumentFile eventsFolder = rootDocFile.findFile("Events");
                    if (eventsFolder == null || !eventsFolder.isDirectory()) {
                        eventsFolder = rootDocFile.createDirectory("Events");
                    }
                    if (eventsFolder != null) {
                        DocumentFile eventFolder = eventsFolder.findFile(sanitizedName);
                        if (eventFolder == null || !eventFolder.isDirectory()) {
                            eventFolder = eventsFolder.createDirectory(sanitizedName);
                        }
                        if (eventFolder != null) {
                            String typeSubfolder = mimeType.startsWith("video/") ? "Videos" : "Photos";
                            DocumentFile typeFolder = eventFolder.findFile(typeSubfolder);
                            if (typeFolder == null || !typeFolder.isDirectory()) {
                                typeFolder = eventFolder.createDirectory(typeSubfolder);
                            }
                            if (typeFolder != null) {
                                parentFolder = typeFolder;
                            }
                        }
                    }
                }
            }

            DocumentFile file = parentFolder.createFile(mimeType, filename);
            if (file == null) {
                call.reject("Cannot create file in local folder");
                return;
            }

            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            OutputStream output = getContext().getContentResolver().openOutputStream(file.getUri());
            if (output == null) {
                call.reject("Cannot open output stream");
                try { file.delete(); } catch (Exception _e) {}
                return;
            }
            output.write(bytes);
            output.flush();
            output.close();

            Log.i(TAG, "saveLocalFile SUCCESS: " + filename + " → " + file.getUri());

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("path", file.getUri().toString());
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "saveLocalFile FAILED: " + e.getMessage(), e);
            call.reject("Save failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void readLocalFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("path required");
            return;
        }
        try {
            Uri uri = Uri.parse(path);
            InputStream input = getContext().getContentResolver().openInputStream(uri);
            if (input == null) {
                call.reject("Cannot open input stream for: " + path);
                return;
            }
            byte[] buffer = new byte[8192];
            int read;
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            while ((read = input.read(buffer)) > 0) {
                baos.write(buffer, 0, read);
            }
            input.close();
            String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("data", base64);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "readLocalFile FAILED: " + e.getMessage(), e);
            call.reject("Read failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void deleteLocalFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("path required");
            return;
        }
        try {
            Uri uri = Uri.parse(path);
            DocumentFile docFile = DocumentFile.fromSingleUri(getContext(), uri);
            if (docFile != null) {
                docFile.delete();
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Delete failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getLocalFolderUri(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uri = prefs.getString(KEY_LOCAL_URI, null);
        JSObject ret = new JSObject();
        ret.put("uri", uri != null ? uri : "");
        ret.put("connected", uri != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void listLocalFiles(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uriStr = prefs.getString(KEY_LOCAL_URI, null);
        if (uriStr == null) {
            JSObject ret = new JSObject();
            ret.put("files", new JSONArray());
            call.resolve(ret);
            return;
        }
        try {
            Uri treeUri = Uri.parse(uriStr);
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
            JSONArray filesArray = new JSONArray();
            if (root != null) {
                listFilesRecursive(root, filesArray);
            }
            JSObject ret = new JSObject();
            ret.put("files", filesArray);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("List failed: " + e.getMessage());
        }
    }

    private void listFilesRecursive(DocumentFile folder, JSONArray filesArray) {
        if (folder == null) return;
        for (DocumentFile file : folder.listFiles()) {
            if (file.isDirectory()) {
                listFilesRecursive(file, filesArray);
            } else if (file.isFile()) {
                try {
                    JSONObject f = new JSONObject();
                    f.put("name", file.getName());
                    f.put("uri", file.getUri().toString());
                    f.put("size", file.length());
                    filesArray.put(f);
                } catch (Exception e) {
                    Log.w(TAG, "listFilesRecursive: " + e.getMessage());
                }
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // GOOGLE DRIVE BACKUP — SQLite queue + reliable processNext
    // ════════════════════════════════════════════════════════════════════════

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "handleFolderPick");
    }

    @ActivityCallback
    public void handleFolderPick(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("User canceled folder selection");
            return;
        }
        Uri treeUri = result.getData() != null ? result.getData().getData() : null;
        if (treeUri == null) {
            call.reject("No folder selected");
            return;
        }
        try {
            int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
        } catch (SecurityException e) {
            Log.w(TAG, "Could not take persistable permission: " + e.getMessage());
        }
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_DRIVE_URI, treeUri.toString()).apply();
        Log.i(TAG, "Drive backup folder set: " + treeUri);

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("uri", treeUri.toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void hasFolder(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uri = prefs.getString(KEY_DRIVE_URI, null);
        JSObject ret = new JSObject();
        ret.put("hasFolder", uri != null);
        ret.put("uri", uri != null ? uri : "");
        call.resolve(ret);
    }

    @PluginMethod
    public void clearFolder(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().remove(KEY_DRIVE_URI).apply();
        call.resolve();
    }

    @PluginMethod
    public void getFolderUri(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uri = prefs.getString(KEY_DRIVE_URI, null);
        JSObject ret = new JSObject();
        ret.put("uri", uri != null ? uri : "");
        ret.put("connected", uri != null);
        call.resolve(ret);
    }

    /**
     * v4.7.9: Enqueue upload ke SQLite queue. Return immediately.
     * Upload di-process oleh processNextUpload() yang dipanggil periodic.
     */
    @PluginMethod
    public void enqueueUpload(PluginCall call) {
        if (queueDb == null) {
            call.reject("Queue database not initialized");
            return;
        }
        String localPath = call.getString("localPath");
        String filename = call.getString("filename");
        String projectName = call.getString("projectName", "default");
        String mimeType = call.getString("mimeType", MIME_JPEG);

        if (localPath == null || filename == null) {
            call.reject("localPath and filename required");
            return;
        }

        try {
            long id = queueDb.enqueue(filename, localPath, projectName, mimeType);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("id", id);
            ret.put("queueSize", queueDb.countByStatus(UploadQueueDb.STATUS_PENDING));
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "enqueueUpload FAILED: " + e.getMessage(), e);
            call.reject("Enqueue failed: " + e.getMessage());
        }
    }

    /**
     * v4.7.10: Direct upload — synchronous, return detail error.
     * Dipanggil dari JS setelah saveLocalFile. Langsung upload ke Drive folder.
     * Return: { success, driveUri, error, step } — step = dimana gagal untuk debug.
     */
    @PluginMethod
    public void uploadFile(PluginCall call) {
        String localPath = call.getString("localPath");
        String filename = call.getString("filename");
        String projectName = call.getString("projectName", "default");
        String mimeType = call.getString("mimeType", MIME_JPEG);

        if (localPath == null || filename == null) {
            call.reject("localPath and filename required");
            return;
        }

        Log.i(TAG, "uploadFile START: filename=" + filename + ", project=" + projectName + ", localPath=" + localPath.substring(0, Math.min(80, localPath.length())));

        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String treeUriStr = prefs.getString(KEY_DRIVE_URI, null);
            if (treeUriStr == null) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "No Drive folder set — tap Connect di Sync Center dulu");
                ret.put("step", "check_drive_folder");
                call.resolve(ret);
                return;
            }

            Log.i(TAG, "uploadFile: Drive folder URI = " + treeUriStr.substring(0, Math.min(60, treeUriStr.length())));

            Uri treeUri = Uri.parse(treeUriStr);
            DocumentFile rootDocFile = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (rootDocFile == null) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "Cannot access Drive folder — fromTreeUri returned null. Re-connect di Sync Center.");
                ret.put("step", "fromTreeUri");
                call.resolve(ret);
                return;
            }
            if (!rootDocFile.canWrite()) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "Drive folder not writable — re-connect di Sync Center");
                ret.put("step", "canWrite");
                call.resolve(ret);
                return;
            }

            Log.i(TAG, "uploadFile: rootDocFile OK, canWrite=true");

            // Create Events/ subfolder
            DocumentFile eventsFolder = rootDocFile.findFile("Events");
            if (eventsFolder == null || !eventsFolder.isDirectory()) {
                eventsFolder = rootDocFile.createDirectory("Events");
                Log.i(TAG, "uploadFile: created Events/ folder");
            }
            if (eventsFolder == null) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "Cannot create Events folder in Drive");
                ret.put("step", "create_Events");
                call.resolve(ret);
                return;
            }

            // Create Events/<EventName>/ subfolder
            String sanitizedName = projectName.replaceAll("[^a-zA-Z0-9_\\-\\s]", "").replaceAll("\\s+", "_");
            if (sanitizedName.isEmpty()) sanitizedName = "default";

            DocumentFile eventFolder = eventsFolder.findFile(sanitizedName);
            if (eventFolder == null || !eventFolder.isDirectory()) {
                eventFolder = eventsFolder.createDirectory(sanitizedName);
                Log.i(TAG, "uploadFile: created Events/" + sanitizedName + "/ folder");
            }
            if (eventFolder == null) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "Cannot create event folder: " + sanitizedName);
                ret.put("step", "create_event_folder");
                call.resolve(ret);
                return;
            }

            // Create Events/<EventName>/Photos/ or Videos/ subfolder
            String typeSubfolder = mimeType.startsWith("video/") ? "Videos" : "Photos";
            DocumentFile typeFolder = eventFolder.findFile(typeSubfolder);
            if (typeFolder == null || !typeFolder.isDirectory()) {
                typeFolder = eventFolder.createDirectory(typeSubfolder);
                Log.i(TAG, "uploadFile: created Events/" + sanitizedName + "/" + typeSubfolder + "/ folder");
            }
            if (typeFolder == null) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "Cannot create " + typeSubfolder + " folder");
                ret.put("step", "create_type_folder");
                call.resolve(ret);
                return;
            }

            // Create file in Drive folder
            DocumentFile driveFile = typeFolder.createFile(mimeType, filename);
            if (driveFile == null) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "createFile returned null for " + filename);
                ret.put("step", "createFile");
                call.resolve(ret);
                return;
            }

            Log.i(TAG, "uploadFile: created file " + filename + " → " + driveFile.getUri());

            // Copy bytes: local file → Drive document
            Uri localUri = Uri.parse(localPath);
            InputStream input = getContext().getContentResolver().openInputStream(localUri);
            if (input == null) {
                try { driveFile.delete(); } catch (Exception _e) {}
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "Cannot open input stream for local file: " + localPath);
                ret.put("step", "open_input_stream");
                call.resolve(ret);
                return;
            }
            OutputStream output = getContext().getContentResolver().openOutputStream(driveFile.getUri());
            if (output == null) {
                input.close();
                try { driveFile.delete(); } catch (Exception _e) {}
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "Cannot open output stream for Drive document");
                ret.put("step", "open_output_stream");
                call.resolve(ret);
                return;
            }

            byte[] buffer = new byte[8192];
            int read;
            long totalBytes = 0;
            while ((read = input.read(buffer)) > 0) {
                output.write(buffer, 0, read);
                totalBytes += read;
            }
            output.flush();
            input.close();
            output.close();

            Log.i(TAG, "uploadFile SUCCESS: " + filename + " (" + totalBytes + " bytes) → Events/" + sanitizedName + "/" + typeSubfolder + "/");

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("driveUri", driveFile.getUri().toString());
            ret.put("bytesUploaded", totalBytes);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "uploadFile EXCEPTION: " + e.getMessage(), e);
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", e.getMessage() != null ? e.getMessage() : e.toString());
            ret.put("step", "exception");
            call.resolve(ret);
        }
    }

    /**
     * v4.7.9: Process next upload from SQLite queue. Reliable — dequeue + upload + mark done/failed.
     * Returns detail: { processed, success, filename, error, queueSize, totalUploaded }
     */
    @PluginMethod
    public void processNextUpload(PluginCall call) {
        if (queueDb == null) {
            call.reject("Queue database not initialized");
            return;
        }
        try {
            // Reset stuck UPLOADING items first
            queueDb.resetStuckItems();

            // Dequeue next PENDING item
            Cursor cursor = queueDb.dequeueCursor();
            if (cursor == null || !cursor.moveToFirst()) {
                if (cursor != null) cursor.close();
                JSObject ret = new JSObject();
                ret.put("processed", false);
                ret.put("queueSize", 0);
                call.resolve(ret);
                return;
            }

            long id = cursor.getLong(cursor.getColumnIndexOrThrow("id"));
            String filename = cursor.getString(cursor.getColumnIndexOrThrow("filename"));
            String localPath = cursor.getString(cursor.getColumnIndexOrThrow("local_uri"));
            String projectName = cursor.getString(cursor.getColumnIndexOrThrow("project_name"));
            String mimeType = cursor.getString(cursor.getColumnIndexOrThrow("mime_type"));
            cursor.close();

            // Mark as UPLOADING
            queueDb.markUploading(id);

            // Attempt upload
            String uploadError = null;
            boolean success = false;
            try {
                success = doUpload(localPath, filename, projectName, mimeType);
            } catch (Exception e) {
                uploadError = e.getMessage();
                Log.e(TAG, "processNextUpload upload exception: " + uploadError, e);
            }

            if (success) {
                queueDb.markDone(id);
                queueDb.incrementUploaded();
                Log.i(TAG, "Upload SUCCESS: " + filename);

                JSObject ret = new JSObject();
                ret.put("processed", true);
                ret.put("success", true);
                ret.put("filename", filename);
                ret.put("queueSize", queueDb.countByStatus(UploadQueueDb.STATUS_PENDING));
                ret.put("totalUploaded", queueDb.getTotalUploaded());
                call.resolve(ret);
            } else {
                String error = uploadError != null ? uploadError : "Upload failed (no exception)";
                queueDb.markFailed(id, error);
                Log.w(TAG, "Upload FAILED: " + filename + " — " + error);

                JSObject ret = new JSObject();
                ret.put("processed", true);
                ret.put("success", false);
                ret.put("filename", filename);
                ret.put("error", error);
                ret.put("queueSize", queueDb.countByStatus(UploadQueueDb.STATUS_PENDING));
                ret.put("totalUploaded", queueDb.getTotalUploaded());
                call.resolve(ret);
            }
        } catch (Exception e) {
            Log.e(TAG, "processNextUpload FAILED: " + e.getMessage(), e);
            call.reject("Process failed: " + e.getMessage());
        }
    }

    /**
     * Core upload logic — creates Events/<EventName>/Photos|Videos/<filename> structure.
     * Throws on error so caller can markFailed with detail.
     */
    private boolean doUpload(String localPath, String filename, String projectName, String mimeType) throws Exception {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String treeUriStr = prefs.getString(KEY_DRIVE_URI, null);
        if (treeUriStr == null) {
            throw new Exception("No Drive folder set");
        }

        Uri treeUri = Uri.parse(treeUriStr);
        DocumentFile rootDocFile = DocumentFile.fromTreeUri(getContext(), treeUri);
        if (rootDocFile == null) {
            throw new Exception("Cannot access Drive folder — fromTreeUri returned null");
        }
        if (!rootDocFile.canWrite()) {
            throw new Exception("Drive folder not writable — may need to re-connect");
        }

        // Create Events/ subfolder
        DocumentFile eventsFolder = rootDocFile.findFile("Events");
        if (eventsFolder == null || !eventsFolder.isDirectory()) {
            eventsFolder = rootDocFile.createDirectory("Events");
        }
        if (eventsFolder == null) {
            throw new Exception("Cannot create Events folder in Drive");
        }

        // Create Events/<EventName>/ subfolder
        String sanitizedName = projectName.replaceAll("[^a-zA-Z0-9_\\-\\s]", "").replaceAll("\\s+", "_");
        if (sanitizedName.isEmpty()) sanitizedName = "default";

        DocumentFile eventFolder = eventsFolder.findFile(sanitizedName);
        if (eventFolder == null || !eventFolder.isDirectory()) {
            eventFolder = eventsFolder.createDirectory(sanitizedName);
        }
        if (eventFolder == null) {
            throw new Exception("Cannot create event folder: " + sanitizedName);
        }

        // Create Events/<EventName>/Photos/ or Videos/ subfolder
        String typeSubfolder = mimeType.startsWith("video/") ? "Videos" : "Photos";
        DocumentFile typeFolder = eventFolder.findFile(typeSubfolder);
        if (typeFolder == null || !typeFolder.isDirectory()) {
            typeFolder = eventFolder.createDirectory(typeSubfolder);
        }
        if (typeFolder == null) {
            throw new Exception("Cannot create " + typeSubfolder + " folder");
        }

        // Create file in Drive folder
        DocumentFile driveFile = typeFolder.createFile(mimeType, filename);
        if (driveFile == null) {
            throw new Exception("createFile returned null for " + filename);
        }

        // Copy bytes: local file → Drive document
        Uri localUri = Uri.parse(localPath);
        InputStream input = getContext().getContentResolver().openInputStream(localUri);
        if (input == null) {
            try { driveFile.delete(); } catch (Exception _e) {}
            throw new Exception("Cannot open input stream for: " + localPath);
        }
        OutputStream output = getContext().getContentResolver().openOutputStream(driveFile.getUri());
        if (output == null) {
            input.close();
            try { driveFile.delete(); } catch (Exception _e) {}
            throw new Exception("Cannot open output stream for Drive document");
        }

        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) > 0) {
            output.write(buffer, 0, read);
        }
        output.flush();
        input.close();
        output.close();

        Log.i(TAG, "doUpload SUCCESS: " + filename + " → Events/" + sanitizedName + "/" + typeSubfolder + "/");
        return true;
    }

    /**
     * Get upload stats — reliable, never throws.
     */
    @PluginMethod
    public void getUploadStats(PluginCall call) {
        JSObject ret = new JSObject();
        if (queueDb == null) {
            ret.put("queueSize", 0);
            ret.put("pending", 0);
            ret.put("uploading", 0);
            ret.put("failed", 0);
            ret.put("totalUploaded", 0);
            call.resolve(ret);
            return;
        }
        try {
            ret.put("pending", queueDb.countByStatus(UploadQueueDb.STATUS_PENDING));
            ret.put("uploading", queueDb.countByStatus(UploadQueueDb.STATUS_UPLOADING));
            ret.put("failed", queueDb.countByStatus(UploadQueueDb.STATUS_FAILED));
            ret.put("totalUploaded", queueDb.getTotalUploaded());
            ret.put("queueSize", queueDb.countByStatus(UploadQueueDb.STATUS_PENDING)
                    + queueDb.countByStatus(UploadQueueDb.STATUS_UPLOADING)
                    + queueDb.countByStatus(UploadQueueDb.STATUS_FAILED));
        } catch (Exception e) {
            ret.put("queueSize", 0);
            ret.put("pending", 0);
            ret.put("uploading", 0);
            ret.put("failed", 0);
            ret.put("totalUploaded", 0);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void retryAllFailed(PluginCall call) {
        if (queueDb != null) {
            queueDb.retryAllFailed();
        }
        call.resolve();
    }
}
