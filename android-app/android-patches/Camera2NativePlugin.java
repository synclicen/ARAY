package com.aray.booth;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Base64;
import android.util.Log;
import android.view.Surface;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

/**
 * ARAY Camera2 Plugin — Native Camera2 API for USB capture card support.
 *
 * Port dari Saatiril-Andro Camera2Manager.kt
 *
 * Camera2 API with LENS_FACING_EXTERNAL can access USB capture cards
 * that WebView getUserMedia cannot see.
 *
 * Functions:
 * 1. enumerateCameras() — list ALL cameras including USB/external
 * 2. openCamera(cameraId) — open specific camera (front, back, USB)
 * 3. startPreview() — stream preview frames as base64 via events
 * 4. capturePhoto() — high-quality JPEG capture
 * 5. closeCamera() — release camera
 */
@CapacitorPlugin(name = "Camera2Native")
public class Camera2NativePlugin extends Plugin {
    private static final String TAG = "Camera2Native";
    private static final int PREVIEW_WIDTH = 640;
    private static final int PREVIEW_HEIGHT = 480;
    private static final int CAPTURE_WIDTH = 1920;
    private static final int CAPTURE_HEIGHT = 1080;

    private CameraManager cameraManager;
    private CameraDevice cameraDevice;
    private CameraCaptureSession captureSession;
    private ImageReader previewReader;
    private ImageReader photoReader;
    private HandlerThread backgroundThread;
    private Handler backgroundHandler;
    private boolean isOpening = false;
    private boolean closeRequested = false;
    private String currentCameraId = "";
    private PluginCall pendingPhotoCallback = null;

    @Override
    public void load() {
        super.load();
        cameraManager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
        Log.i(TAG, "Camera2Native plugin loaded");
    }

    private void startBackgroundThread() {
        if (backgroundThread != null && backgroundThread.isAlive()) return;
        backgroundThread = new HandlerThread("Camera2Background");
        backgroundThread.start();
        backgroundHandler = new Handler(backgroundThread.getLooper());
    }

    private void stopBackgroundThread() {
        try {
            if (backgroundThread != null) {
                backgroundThread.quitSafely();
                backgroundThread.join(100);
            }
        } catch (InterruptedException e) {
            // ignore
        }
        backgroundThread = null;
        backgroundHandler = null;
    }

    /**
     * Enumerate ALL cameras — including USB/external via LENS_FACING_EXTERNAL.
     */
    @PluginMethod
    public void enumerateCameras(PluginCall call) {
        JSONArray camerasArray = new JSONArray();
        try {
            String[] cameraIds = cameraManager.getCameraIdList();
            Log.i(TAG, "Found " + cameraIds.length + " cameras");

            for (String id : cameraIds) {
                try {
                    CameraCharacteristics chars = cameraManager.getCameraCharacteristics(id);
                    Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
                    boolean isExternal = isExternalCamera(id, facing != null ? facing : -1);

                    String label;
                    if (isExternal) {
                        label = "USB Capture Card";
                    } else if (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                        label = "Kamera Belakang";
                    } else if (facing != null && facing == CameraCharacteristics.LENS_FACING_FRONT) {
                        label = "Kamera Depan";
                    } else {
                        label = "Kamera " + id;
                    }

                    JSONObject cam = new JSONObject();
                    cam.put("id", id);
                    cam.put("label", label);
                    cam.put("isExternal", isExternal);
                    cam.put("facing", facing != null ? facing : -1);
                    camerasArray.put(cam);

                    Log.i(TAG, "  Camera " + id + ": facing=" + facing + ", external=" + isExternal + ", label=" + label);
                } catch (Exception e) {
                    // Still add it — might be USB camera not fully ready
                    boolean isExternal = id.compareTo("2") >= 0;
                    JSONObject cam = new JSONObject();
                    cam.put("id", id);
                    cam.put("label", isExternal ? "USB Capture Card" : "Kamera " + id);
                    cam.put("isExternal", isExternal);
                    cam.put("facing", -1);
                    camerasArray.put(cam);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "enumerateCameras failed: " + e.getMessage());
        }

        JSObject ret = new JSObject();
        ret.put("cameras", camerasArray);
        call.resolve(ret);
    }

    private boolean isExternalCamera(String cameraId, int facing) {
        if (facing == CameraCharacteristics.LENS_FACING_EXTERNAL) return true;
        if (facing == 2) return true; // LENS_FACING_EXTERNAL raw value
        try {
            int idNum = Integer.parseInt(cameraId);
            if (idNum >= 2) return true;
        } catch (NumberFormatException e) {
            // non-numeric ID — could be external
        }
        return false;
    }

    /**
     * Open a specific camera by ID.
     */
    @PluginMethod
    public void openCamera(PluginCall call) {
        String cameraId = call.getString("cameraId", "");
        if (cameraId.isEmpty()) {
            // Auto-select: USB first, then first available
            try {
                String[] ids = cameraManager.getCameraIdList();
                for (String id : ids) {
                    CameraCharacteristics chars = cameraManager.getCameraCharacteristics(id);
                    Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
                    if (isExternalCamera(id, facing != null ? facing : -1)) {
                        cameraId = id;
                        break;
                    }
                }
                if (cameraId.isEmpty() && ids.length > 0) {
                    cameraId = ids[0];
                }
            } catch (Exception e) {
                call.reject("Failed to get camera list: " + e.getMessage());
                return;
            }
        }

        if (cameraId.isEmpty()) {
            call.reject("No camera available");
            return;
        }

        // Check permission
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Camera permission not granted");
            return;
        }

        // Close current camera
        closeCameraInternal();

        closeRequested = false;
        startBackgroundThread();
        isOpening = true;

        final String finalCameraId = cameraId;
        Log.i(TAG, "Opening camera: " + finalCameraId);

        try {
            cameraManager.openCamera(finalCameraId, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(CameraDevice camera) {
                    isOpening = false;
                    if (closeRequested) {
                        try { camera.close(); } catch (Exception e) {}
                        return;
                    }
                    cameraDevice = camera;
                    currentCameraId = finalCameraId;
                    Log.i(TAG, "Camera opened: " + finalCameraId);
                    startPreviewInternal();

                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("cameraId", finalCameraId);
                    notifyListeners("camera2:opened", ret);
                }

                @Override
                public void onDisconnected(CameraDevice camera) {
                    isOpening = false;
                    Log.w(TAG, "Camera disconnected: " + finalCameraId);
                    try { camera.close(); } catch (Exception e) {}
                    cameraDevice = null;
                    captureSession = null;
                    notifyListeners("camera2:disconnected", new JSObject());
                }

                @Override
                public void onError(CameraDevice camera, int error) {
                    isOpening = false;
                    Log.e(TAG, "Camera error: " + error + " for " + finalCameraId);
                    try { camera.close(); } catch (Exception e) {}
                    cameraDevice = null;
                    captureSession = null;

                    JSObject ret = new JSObject();
                    ret.put("success", false);
                    ret.put("error", "Camera open error: " + error);
                    notifyListeners("camera2:error", ret);
                }
            }, backgroundHandler);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("cameraId", finalCameraId);
            call.resolve(ret);

        } catch (SecurityException e) {
            isOpening = false;
            call.reject("SecurityException: " + e.getMessage());
        } catch (Exception e) {
            isOpening = false;
            call.reject("Failed to open camera: " + e.getMessage());
        }
    }

    /**
     * Start preview — stream frames as base64 via "camera2:frame" events.
     */
    private void startPreviewInternal() {
        if (cameraDevice == null) return;

        try {
            // Close existing session + readers
            if (captureSession != null) {
                captureSession.close();
                captureSession = null;
            }
            if (previewReader != null) {
                previewReader.close();
                previewReader = null;
            }

            // Create preview ImageReader (low res for streaming)
            previewReader = ImageReader.newInstance(PREVIEW_WIDTH, PREVIEW_HEIGHT, ImageFormat.JPEG, 2);
            previewReader.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
                @Override
                public void onImageAvailable(ImageReader reader) {
                    Image image = reader.acquireLatestImage();
                    if (image == null) return;

                    try {
                        ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                        byte[] bytes = new byte[buffer.remaining()];
                        buffer.get(bytes);
                        String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);

                        JSObject frame = new JSObject();
                        frame.put("data", base64);
                        frame.put("width", PREVIEW_WIDTH);
                        frame.put("height", PREVIEW_HEIGHT);
                        notifyListeners("camera2:frame", frame);
                    } catch (Exception e) {
                        Log.w(TAG, "Frame processing error: " + e.getMessage());
                    } finally {
                        image.close();
                    }
                }
            }, backgroundHandler);

            // Create capture session
            List<Surface> surfaces = new ArrayList<>();
            surfaces.add(previewReader.getSurface());

            cameraDevice.createCaptureSession(surfaces, new CameraCaptureSession.StateCallback() {
                @Override
                public void onConfigured(CameraCaptureSession session) {
                    captureSession = session;
                    try {
                        CaptureRequest.Builder builder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                        builder.addTarget(previewReader.getSurface());
                        // Auto-focus
                        try {
                            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                        } catch (Exception e) {}
                        session.setRepeatingRequest(builder.build(), null, backgroundHandler);
                        Log.i(TAG, "Preview started");
                    } catch (Exception e) {
                        Log.e(TAG, "Failed to start preview: " + e.getMessage());
                    }
                }

                @Override
                public void onConfigureFailed(CameraCaptureSession session) {
                    Log.e(TAG, "Preview configuration failed");
                }
            }, backgroundHandler);

        } catch (Exception e) {
            Log.e(TAG, "startPreview failed: " + e.getMessage());
        }
    }

    /**
     * Capture high-quality photo.
     */
    @PluginMethod
    public void capturePhoto(PluginCall call) {
        if (cameraDevice == null || captureSession == null) {
            call.reject("Camera not opened");
            return;
        }

        try {
            // Create photo ImageReader (high res)
            if (photoReader != null) {
                photoReader.close();
            }
            photoReader = ImageReader.newInstance(CAPTURE_WIDTH, CAPTURE_HEIGHT, ImageFormat.JPEG, 2);

            pendingPhotoCallback = call;

            photoReader.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
                @Override
                public void onImageAvailable(ImageReader reader) {
                    Image image = reader.acquireLatestImage();
                    if (image == null) return;

                    try {
                        ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                        byte[] bytes = new byte[buffer.remaining()];
                        buffer.get(bytes);
                        String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);

                        Log.i(TAG, "Photo captured: " + bytes.length + " bytes");

                        if (pendingPhotoCallback != null) {
                            JSObject ret = new JSObject();
                            ret.put("success", true);
                            ret.put("base64", base64);
                            ret.put("width", CAPTURE_WIDTH);
                            ret.put("height", CAPTURE_HEIGHT);
                            pendingPhotoCallback.resolve(ret);
                            pendingPhotoCallback = null;
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Photo processing error: " + e.getMessage());
                        if (pendingPhotoCallback != null) {
                            pendingPhotoCallback.reject("Photo processing failed: " + e.getMessage());
                            pendingPhotoCallback = null;
                        }
                    } finally {
                        image.close();
                    }
                }
            }, backgroundHandler);

            // Capture request
            CaptureRequest.Builder builder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
            builder.addTarget(photoReader.getSurface());
            try {
                builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
            } catch (Exception e) {}
            try {
                builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON_AUTO_FLASH);
            } catch (Exception e) {}
            // JPEG orientation
            try {
                CameraCharacteristics chars = cameraManager.getCameraCharacteristics(cameraDevice.getId());
                Integer orientation = chars.get(CameraCharacteristics.SENSOR_ORIENTATION);
                if (orientation != null) {
                    builder.set(CaptureRequest.JPEG_ORIENTATION, orientation);
                }
            } catch (Exception e) {}

            captureSession.capture(builder.build(), null, backgroundHandler);

        } catch (Exception e) {
            Log.e(TAG, "capturePhoto failed: " + e.getMessage());
            call.reject("Capture failed: " + e.getMessage());
        }
    }

    /**
     * Close camera and release resources.
     */
    @PluginMethod
    public void closeCamera(PluginCall call) {
        closeCameraInternal();
        if (call != null) call.resolve();
    }

    private void closeCameraInternal() {
        closeRequested = true;
        try { if (captureSession != null) captureSession.close(); } catch (Exception e) {}
        captureSession = null;
        try { if (cameraDevice != null) cameraDevice.close(); } catch (Exception e) {}
        cameraDevice = null;
        try { if (previewReader != null) previewReader.close(); } catch (Exception e) {}
        previewReader = null;
        try { if (photoReader != null) photoReader.close(); } catch (Exception e) {}
        photoReader = null;
        currentCameraId = "";
    }

    /**
     * Force rescan for USB cameras.
     */
    @PluginMethod
    public void forceRescan(PluginCall call) {
        enumerateCameras(call);
    }

    @Override
    protected void handleOnDestroy() {
        closeCameraInternal();
        stopBackgroundThread();
        super.handleOnDestroy();
    }
}
