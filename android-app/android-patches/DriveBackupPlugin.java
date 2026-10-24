package com.aray.booth;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.util.Log;
import androidx.activity.result.ActivityResult;
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
 * v4.7.11: Port persis dari Saatiril-Andro PhotoSaver.kt + DriveBackupManager.kt
 * Pakai DocumentsContract API langsung (BUKAN DocumentFile wrapper).
 *
 * KEY INSIGHT: Tree URI dari ACTION_OPEN_DOCUMENT_TREE TIDAK punya /document/ segment.
 * DocumentsContract.createDocument butuh DOCUMENT URI (dengan /document/ segment).
 * normalizeToDocumentUri() convert tree URI → document URI.
 */
@CapacitorPlugin(name = "DriveBackup")
public class DriveBackupPlugin extends Plugin {
    private static final String TAG = "DriveBackupPlugin";
    private static final String PREFS_NAME = "aray_drive_prefs";
    private static final String KEY_DRIVE_URI = "backup_folder_uri";
    private static final String KEY_LOCAL_URI = "local_folder_uri";
    private static final String MIME_JPEG = "image/jpeg";
    private static final String MIME_VIDEO = "video/webm";
    private static final String MIME_DIR = DocumentsContract.Document.MIME_TYPE_DIR;

    // ════════════════════════════════════════════════════════════════════════
    // SAF helper — normalize tree URI to document URI (CRITICAL!)
    // Port dari Saatiril-Andro PhotoSaver.normalizeToDocumentUri
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Convert tree URI → document URI.
     * Tree URI: content://...documents/tree/primary%3AFoo
     * Document URI: content://...documents/tree/primary%3AFoo/document/primary%3AFoo
     *
     * DocumentsContract.createDocument butuh document URI, bukan tree URI.
     * Kalau pakai tree URI langsung, createDocument return null.
     */
    private Uri normalizeToDocumentUri(Uri uri) {
        String path = uri.getPath();
        if (path == null) return uri;
        if (path.contains("/document/")) {
            return uri;  // already a document URI
        }
        try {
            String rootDocId = DocumentsContract.getTreeDocumentId(uri);
            return DocumentsContract.buildDocumentUriUsingTree(uri, rootDocId);
        } catch (Exception e) {
            Log.e(TAG, "normalizeToDocumentUri failed: " + e.getMessage());
            return uri;
        }
    }

    /**
     * v4.7.22: Create a subfolder — robust against Google Drive duplicate name issue.
     * Google Drive allows 2 folders with same name. If createDocument returns
     * a folder with " (1)" suffix, we find and return the original.
     */
    private Uri createSubfolder(Uri treeUri, String folderName) {
        Log.i(TAG, "createSubfolder: name=" + folderName);
        try {
            Uri parentDocUri = normalizeToDocumentUri(treeUri);

            // Check if folder already exists — query children
            String parentDocId = DocumentsContract.getDocumentId(parentDocUri);
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(parentDocUri, parentDocId);
            android.database.Cursor cursor = getContext().getContentResolver().query(
                    childrenUri,
                    new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                                 DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                                 DocumentsContract.Document.COLUMN_MIME_TYPE},
                    null, null, null);
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String name = cursor.getString(1);
                    String mime = cursor.getString(2);
                    if (folderName.equals(name) && MIME_DIR.equals(mime)) {
                        String docId = cursor.getString(0);
                        Uri existingUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);
                        cursor.close();
                        Log.i(TAG, "createSubfolder: existing folder found → " + existingUri);
                        return existingUri;
                    }
                }
                cursor.close();
            }

            // Not found — create new
            Uri docUri = DocumentsContract.createDocument(
                    getContext().getContentResolver(),
                    parentDocUri,
                    MIME_DIR,
                    folderName);
            if (docUri == null) {
                Log.e(TAG, "createSubfolder FAILED: createDocument returned null");
                return null;
            }

            // v4.7.22: Check if Google Drive added " (1)" suffix (duplicate name).
            // If so, query again for the original name and return that instead.
            String createdName = docUri.getLastPathSegment();
            if (createdName != null && createdName.contains("%20(1)")) {
                Log.w(TAG, "createSubfolder: duplicate detected (" + createdName + ") — finding original");
                cursor = getContext().getContentResolver().query(
                        childrenUri,
                        new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                                     DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                                     DocumentsContract.Document.COLUMN_MIME_TYPE},
                        null, null, null);
                if (cursor != null) {
                    while (cursor.moveToNext()) {
                        String name = cursor.getString(1);
                        String mime = cursor.getString(2);
                        if (folderName.equals(name) && MIME_DIR.equals(mime)) {
                            String docId = cursor.getString(0);
                            Uri existingUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);
                            cursor.close();
                            // Delete the duplicate we just created
                            try { DocumentsContract.deleteDocument(getContext().getContentResolver(), docUri); } catch (Exception _e) {}
                            Log.i(TAG, "createSubfolder: returning original, deleted duplicate");
                            return existingUri;
                        }
                    }
                    cursor.close();
                }
            }

            Log.i(TAG, "createSubfolder SUCCESS: " + folderName + " → " + docUri);
            return docUri;
        } catch (Exception e) {
            Log.e(TAG, "createSubfolder FAILED: " + e.getMessage(), e);
            return null;
        }
    }

    /**
     * Save binary data to a document URI (file inside SAF folder).
     * Port dari Saatiril-Andro PhotoSaver.savePhoto.
     */
    private Uri saveFileToUri(Uri parentDocUri, String filename, String mimeType, byte[] bytes) {
        Log.i(TAG, "saveFileToUri: filename=" + filename + ", mimeType=" + mimeType + ", bytes=" + bytes.length);
        try {
            Uri docUri = DocumentsContract.createDocument(
                    getContext().getContentResolver(),
                    parentDocUri,
                    mimeType,
                    filename);
            if (docUri == null) {
                Log.e(TAG, "saveFileToUri FAILED: createDocument returned null for " + filename);
                return null;
            }
            OutputStream out = getContext().getContentResolver().openOutputStream(docUri);
            if (out == null) {
                Log.e(TAG, "saveFileToUri FAILED: openOutputStream returned null");
                try { getContext().getContentResolver().delete(docUri, null, null); } catch (Exception _e) {}
                return null;
            }
            out.write(bytes);
            out.flush();
            out.close();
            Log.i(TAG, "saveFileToUri SUCCESS: " + filename + " (" + bytes.length + " bytes) → " + docUri);
            return docUri;
        } catch (Exception e) {
            Log.e(TAG, "saveFileToUri FAILED: " + e.getMessage(), e);
            return null;
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
            call.reject("User canceled");
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
            Log.w(TAG, "takePersistableUriPermission failed: " + e.getMessage());
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

    /**
     * Save file to local folder via DocumentsContract.
     * Structure: Events/<EventName>/Photos|Videos/<filename>
     */
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
            call.reject("No local folder set");
            return;
        }

        try {
            Uri treeUri = Uri.parse(treeUriStr);

            // Strip data: prefix
            String pureBase64 = base64Data.contains(",") ? base64Data.substring(base64Data.indexOf(",") + 1) : base64Data;
            byte[] bytes = Base64.decode(pureBase64, Base64.DEFAULT);

            // Navigate/create folder structure: Events/<EventName>/Photos|Videos/
            Uri currentUri = treeUri;
            String sanitizedName = subfolder.replaceAll("[^a-zA-Z0-9_\\-\\s]", "").replaceAll("\\s+", "_");
            if (sanitizedName.isEmpty()) sanitizedName = "default";
            String typeSubfolder = mimeType.startsWith("video/") ? "Videos" : "Photos";

            // Create Events/ folder
            Uri eventsUri = createSubfolder(currentUri, "Events");
            if (eventsUri == null) { call.reject("Cannot create Events folder"); return; }
            currentUri = eventsUri;

            // Create Events/<EventName>/ folder
            Uri eventUri = createSubfolder(currentUri, sanitizedName);
            if (eventUri == null) { call.reject("Cannot create event folder: " + sanitizedName); return; }
            currentUri = eventUri;

            // Create Events/<EventName>/Photos|Videos/ folder
            Uri typeUri = createSubfolder(currentUri, typeSubfolder);
            if (typeUri == null) { call.reject("Cannot create " + typeSubfolder + " folder"); return; }
            currentUri = typeUri;

            // Save file
            Uri fileUri = saveFileToUri(currentUri, filename, mimeType, bytes);
            if (fileUri == null) { call.reject("Cannot create file: " + filename); return; }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("path", fileUri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "saveLocalFile FAILED: " + e.getMessage(), e);
            call.reject("Save failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void readLocalFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null) { call.reject("path required"); return; }
        try {
            Uri uri = Uri.parse(path);
            InputStream input = getContext().getContentResolver().openInputStream(uri);
            if (input == null) { call.reject("Cannot open: " + path); return; }
            byte[] buffer = new byte[8192];
            int read;
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            while ((read = input.read(buffer)) > 0) baos.write(buffer, 0, read);
            input.close();
            String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("data", base64);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Read failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void deleteLocalFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null) { call.reject("path required"); return; }
        try {
            Uri uri = Uri.parse(path);
            DocumentsContract.deleteDocument(getContext().getContentResolver(), uri);
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
            JSONArray filesArray = new JSONArray();
            listFilesRecursive(treeUri, filesArray);
            JSObject ret = new JSObject();
            ret.put("files", filesArray);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("List failed: " + e.getMessage());
        }
    }

    private void listFilesRecursive(Uri folderUri, JSONArray filesArray) {
        try {
            Uri docUri = normalizeToDocumentUri(folderUri);
            String docId = DocumentsContract.getDocumentId(docUri);
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(docUri, docId);
            android.database.Cursor cursor = getContext().getContentResolver().query(
                    childrenUri,
                    new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                                 DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                                 DocumentsContract.Document.COLUMN_MIME_TYPE,
                                 DocumentsContract.Document.COLUMN_SIZE},
                    null, null, null);
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String childDocId = cursor.getString(0);
                    String name = cursor.getString(1);
                    String mime = cursor.getString(2);
                    long size = cursor.getLong(3);
                    Uri childUri = DocumentsContract.buildDocumentUriUsingTree(folderUri, childDocId);
                    if (MIME_DIR.equals(mime)) {
                        listFilesRecursive(childUri, filesArray);
                    } else {
                        try {
                            JSONObject f = new JSONObject();
                            f.put("name", name);
                            f.put("uri", childUri.toString());
                            f.put("size", size);
                            filesArray.put(f);
                        } catch (Exception e) {
                            Log.w(TAG, "listFilesRecursive: " + e.getMessage());
                        }
                    }
                }
                cursor.close();
            }
        } catch (Exception e) {
            Log.w(TAG, "listFilesRecursive error: " + e.getMessage());
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // GOOGLE DRIVE BACKUP — DocumentsContract API (port Saatiril-Andro)
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
            call.reject("User canceled");
            return;
        }
        Uri treeUri = result.getData() != null ? result.getData().getData() : null;
        if (treeUri == null) { call.reject("No folder selected"); return; }
        try {
            int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
        } catch (SecurityException e) {
            Log.w(TAG, "takePersistableUriPermission failed: " + e.getMessage());
        }
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_DRIVE_URI, treeUri.toString()).apply();
        Log.i(TAG, "Drive folder set: " + treeUri);

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
     * Direct upload — copy file from localPath to Drive folder.
     * Uses DocumentsContract API (port dari Saatiril-Andro).
     * Structure: Events/<EventName>/Photos|Videos/<filename>
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

        Log.i(TAG, "uploadFile START: " + filename + ", project=" + projectName);

        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String treeUriStr = prefs.getString(KEY_DRIVE_URI, null);
            if (treeUriStr == null) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "No Drive folder set");
                ret.put("step", "check_drive_folder");
                call.resolve(ret);
                return;
            }

            Uri driveTreeUri = Uri.parse(treeUriStr);
            String sanitizedName = projectName.replaceAll("[^a-zA-Z0-9_\\-\\s]", "").replaceAll("\\s+", "_");
            if (sanitizedName.isEmpty()) sanitizedName = "default";
            String typeSubfolder = mimeType.startsWith("video/") ? "Videos" : "Photos";

            // Create folder structure in Drive: Events/<EventName>/Photos|Videos/
            Log.i(TAG, "uploadFile: creating Events/ folder");
            Uri eventsUri = createSubfolder(driveTreeUri, "Events");
            if (eventsUri == null) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "Cannot create Events folder in Drive");
                ret.put("step", "create_Events");
                call.resolve(ret);
                return;
            }

            Log.i(TAG, "uploadFile: creating Events/" + sanitizedName + "/ folder");
            Uri eventUri = createSubfolder(eventsUri, sanitizedName);
            if (eventUri == null) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "Cannot create event folder: " + sanitizedName);
                ret.put("step", "create_event_folder");
                call.resolve(ret);
                return;
            }

            Log.i(TAG, "uploadFile: creating " + typeSubfolder + "/ folder");
            Uri typeUri = createSubfolder(eventUri, typeSubfolder);
            if (typeUri == null) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "Cannot create " + typeSubfolder + " folder");
                ret.put("step", "create_type_folder");
                call.resolve(ret);
                return;
            }

            // Create file in Drive folder
            Log.i(TAG, "uploadFile: creating file " + filename);
            Uri driveFileUri = DocumentsContract.createDocument(
                    getContext().getContentResolver(),
                    typeUri,
                    mimeType,
                    filename);
            if (driveFileUri == null) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "createDocument returned null for " + filename);
                ret.put("step", "createFile");
                call.resolve(ret);
                return;
            }

            // Copy bytes: local file → Drive document
            Uri localUri = Uri.parse(localPath);
            InputStream input = getContext().getContentResolver().openInputStream(localUri);
            if (input == null) {
                try { DocumentsContract.deleteDocument(getContext().getContentResolver(), driveFileUri); } catch (Exception _e) {}
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "Cannot open local file: " + localPath);
                ret.put("step", "open_input_stream");
                call.resolve(ret);
                return;
            }
            OutputStream output = getContext().getContentResolver().openOutputStream(driveFileUri);
            if (output == null) {
                input.close();
                try { DocumentsContract.deleteDocument(getContext().getContentResolver(), driveFileUri); } catch (Exception _e) {}
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "Cannot open Drive output stream");
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
            ret.put("driveUri", driveFileUri.toString());
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

    // Queue methods — stubs for backward compat (not used in v4.7.11)
    @PluginMethod
    public void enqueueUpload(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("queueSize", 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void processNextUpload(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("processed", false);
        ret.put("queueSize", 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void getUploadStats(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("queueSize", 0);
        ret.put("pending", 0);
        ret.put("uploading", 0);
        ret.put("failed", 0);
        ret.put("totalUploaded", 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void retryAllFailed(PluginCall call) {
        call.resolve();
    }
}
