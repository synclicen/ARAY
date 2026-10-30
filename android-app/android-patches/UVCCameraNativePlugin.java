package com.aray.booth;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.SurfaceTexture;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.util.Log;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.serenegiant.usb.UVCCamera;
import com.serenegiant.usb.USBMonitor;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.Map;

/**
 * ARAY UVC Camera Plugin — USB capture card support via UVC library.
 *
 * Port dari Saatiril-Andro UVCCameraManager.kt
 *
 * Uses org.uvccamera:lib for direct USB UVC device access.
 * This is the ONLY reliable way to access USB capture cards on Android.
 * Camera2 API cannot see all UVC devices — UVC library bypasses Camera2
 * and talks directly to USB device via USB Host API.
 *
 * Features:
 * 1. initCamera() — register USBMonitor for device attach/detach
 * 2. enumerateCameras() — list all connected UVC devices
 * 3. openCamera(deviceName) — open specific UVC device
 * 4. Preview via TextureView overlay (same as Saatiril-Andro)
 * 5. capturePhoto() — JPEG snapshot
 * 6. closeCamera() — release resources
 */
@CapacitorPlugin(name = "UVCCameraNative")
public class UVCCameraNativePlugin extends Plugin {
    private static final String TAG = "UVCCameraNative";
    private static final String ACTION_USB_PERMISSION = "com.aray.booth.USB_PERMISSION";

    // Preview settings — same as Saatiril-Andro
    private static final int PREVIEW_WIDTH = 1280;
    private static final int PREVIEW_HEIGHT = 720;
    private static final int PREVIEW_MIN_FPS = 1;
    private static final int PREVIEW_MAX_FPS = 30;
    private static final int PREVIEW_FORMAT = UVCCamera.FRAME_FORMAT_MJPEG;
    private static final float BANDWIDTH_FACTOR = 1.0f;

    // Known UVC Vendor IDs
    private static final int VENDOR_MACROSILICON = 0x345F;
    private static final int VENDOR_FUSHICAI = 0x0489;
    private static final int VENDOR_MAGEWELL = 0x0416;

    // State
    private USBMonitor usbMonitor;
    private UVCCamera uvcCamera;
    private boolean isRegistered = false;
    private UsbDevice currentUsbDevice;
    private USBMonitor.UsbControlBlock currentCtrlBlock;

    // Preview
    private AutoFitTextureView textureView;
    private FrameLayout textureContainer;
    private Surface previewSurface;
    // v4.7.53: Target aspect ratio for TextureView (width / height).
    // 0 = fill screen (MATCH_PARENT). Non-zero = constrain to ratio, centered.
    private float targetAspectRatio = 0f;

    // Background thread
    private HandlerThread backgroundThread;
    private Handler backgroundHandler;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // Capture
    private PluginCall pendingPhotoCallback;

    // USB permission
    private BroadcastReceiver usbPermissionReceiver;

    // Discovered devices
    private final Map<String, UsbDevice> discoveredDevices = new HashMap<>();

    // Polling for Android 14+
    private Runnable usbPollingRunnable;
    private static final long USB_POLLING_INTERVAL_MS = 2000;

    @Override
    public void load() {
        super.load();
        Log.i(TAG, "UVCCameraNative plugin loaded");
    }

    /**
     * Initialize UVC camera system — register USBMonitor.
     */
    @PluginMethod
    public void initCamera(PluginCall call) {
        try {
            startBackgroundThread();
            registerUsbMonitor();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "initCamera failed: " + e.getMessage(), e);
            call.reject("Init failed: " + e.getMessage());
        }
    }

    private void startBackgroundThread() {
        if (backgroundThread != null && backgroundThread.isAlive()) return;
        backgroundThread = new HandlerThread("UVCameraBackground");
        backgroundThread.start();
        backgroundHandler = new Handler(backgroundThread.getLooper());
    }

    private void stopBackgroundThread() {
        try {
            if (backgroundThread != null) {
                backgroundThread.quitSafely();
                backgroundThread.join(100);
            }
        } catch (Exception e) {}
        backgroundThread = null;
        backgroundHandler = null;
    }

    // ═══════════════════════════════════════════════════════════════
    // USB Monitor — detect UVC device attach/detach
    // ═══════════════════════════════════════════════════════════════

    private void registerUsbMonitor() {
        if (isRegistered) return;

        try {
            usbMonitor = new USBMonitor(getContext(), new USBMonitor.OnDeviceConnectListener() {
                @Override
                public void onAttach(UsbDevice device) {
                    Log.i(TAG, "USB ATTACHED: " + device.getDeviceName() + " vid=0x" + Integer.toHexString(device.getVendorId()));
                    if (isUVCDevice(device)) {
                        Log.i(TAG, "★ UVC VIDEO DEVICE detected!");
                        discoveredDevices.put(device.getDeviceName(), device);
                        updateAvailableCameras();
                        requestUsbPermission(device);
                    }
                }

                @Override
                public void onDisconnect(UsbDevice device, USBMonitor.UsbControlBlock ctrlBlock) {
                    Log.i(TAG, "USB DISCONNECTED: " + device.getDeviceName());
                    handleDeviceDisconnect(device);
                }

                @Override
                public void onConnect(UsbDevice device, USBMonitor.UsbControlBlock ctrlBlock, boolean createNew) {
                    Log.i(TAG, "USB CONNECTED: " + device.getDeviceName());
                    currentUsbDevice = device;
                    currentCtrlBlock = ctrlBlock;
                    if (backgroundHandler != null) {
                        backgroundHandler.post(() -> openUVCCamera(device, ctrlBlock));
                    }
                }

                @Override
                public void onDettach(UsbDevice device) {
                    Log.i(TAG, "USB DETACHED: " + device.getDeviceName());
                    discoveredDevices.remove(device.getDeviceName());
                    updateAvailableCameras();
                    handleDeviceDisconnect(device);
                }

                @Override
                public void onCancel(UsbDevice device) {
                    Log.i(TAG, "USB permission CANCELLED for: " + device.getDeviceName());
                }
            });

            usbMonitor.register();
            isRegistered = true;
            Log.i(TAG, "USBMonitor registered successfully");

            registerUsbPermissionReceiver();
            enumerateConnectedDevices();
            startUsbPolling();

        } catch (Exception e) {
            Log.e(TAG, "Failed to register USBMonitor: " + e.getMessage(), e);
        }
    }

    private void enumerateConnectedDevices() {
        try {
            UsbManager usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
            if (usbManager == null) return;

            for (UsbDevice device : usbManager.getDeviceList().values()) {
                Log.i(TAG, "Enumerating: " + device.getDeviceName() + " vid=0x" + Integer.toHexString(device.getVendorId()));
                if (isUVCDevice(device)) {
                    Log.i(TAG, "★ Already-connected UVC device: " + device.getDeviceName());
                    discoveredDevices.put(device.getDeviceName(), device);
                    if (!usbManager.hasPermission(device)) {
                        requestUsbPermission(device);
                    }
                }
            }
            updateAvailableCameras();
        } catch (Exception e) {
            Log.e(TAG, "Device enumeration failed: " + e.getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Android 14+ USB polling fallback
    // ═══════════════════════════════════════════════════════════════

    private void startUsbPolling() {
        stopUsbPolling();
        usbPollingRunnable = new Runnable() {
            @Override
            public void run() {
                try {
                    pollUsbDevices();
                } catch (Exception e) {
                    Log.e(TAG, "USB polling error: " + e.getMessage());
                }
                if (usbPollingRunnable != null) {
                    mainHandler.postDelayed(usbPollingRunnable, USB_POLLING_INTERVAL_MS);
                }
            }
        };
        mainHandler.postDelayed(usbPollingRunnable, USB_POLLING_INTERVAL_MS);
        Log.i(TAG, "USB polling fallback started");
    }

    private void stopUsbPolling() {
        if (usbPollingRunnable != null) {
            mainHandler.removeCallbacks(usbPollingRunnable);
            usbPollingRunnable = null;
        }
    }

    private void pollUsbDevices() {
        try {
            UsbManager usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
            if (usbManager == null) return;

            boolean newDeviceFound = false;
            for (UsbDevice device : usbManager.getDeviceList().values()) {
                if (discoveredDevices.containsKey(device.getDeviceName())) continue;
                if (isUVCDevice(device)) {
                    Log.i(TAG, "★ Polling found NEW UVC device: " + device.getDeviceName());
                    discoveredDevices.put(device.getDeviceName(), device);
                    newDeviceFound = true;
                    if (!usbManager.hasPermission(device)) {
                        requestUsbPermission(device);
                    }
                }
            }

            // Check disconnected
            for (String key : new java.util.ArrayList<>(discoveredDevices.keySet())) {
                if (!usbManager.getDeviceList().containsKey(key)) {
                    UsbDevice device = discoveredDevices.remove(key);
                    if (device != null) {
                        Log.i(TAG, "Polling detected USB DISCONNECT: " + device.getDeviceName());
                        handleDeviceDisconnect(device);
                        newDeviceFound = true;
                    }
                }
            }

            if (newDeviceFound) updateAvailableCameras();
        } catch (Exception e) {
            Log.e(TAG, "USB polling failed: " + e.getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // USB Permission
    // ═══════════════════════════════════════════════════════════════

    private void registerUsbPermissionReceiver() {
        if (usbPermissionReceiver != null) return;
        usbPermissionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (ACTION_USB_PERMISSION.equals(intent.getAction())) {
                    UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                    Log.i(TAG, "USB permission result: " + device + " granted=" + granted);
                    if (granted && device != null) {
                        tryOpenUVCCameraDirect(device);
                    }
                }
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(usbPermissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(usbPermissionReceiver, filter);
        }
    }

    private void requestUsbPermission(UsbDevice device) {
        try {
            UsbManager usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
            if (usbManager == null) return;

            if (usbManager.hasPermission(device)) {
                tryOpenUVCCameraDirect(device);
                return;
            }

            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                ? PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                : PendingIntent.FLAG_UPDATE_CURRENT;

            Intent intent = new Intent(ACTION_USB_PERMISSION);
            intent.putExtra(UsbManager.EXTRA_DEVICE, device);
            PendingIntent pi = PendingIntent.getBroadcast(getContext(), device.getDeviceName().hashCode(), intent, flags);
            usbManager.requestPermission(device, pi);
            Log.i(TAG, "USB permission requested for " + device.getDeviceName());
        } catch (Exception e) {
            Log.e(TAG, "Failed to request USB permission: " + e.getMessage());
        }
    }

    private void tryOpenUVCCameraDirect(UsbDevice device) {
        try {
            UsbManager usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
            if (usbManager == null || !usbManager.hasPermission(device)) return;

            if (currentUsbDevice != null && currentUsbDevice.getDeviceName().equals(device.getDeviceName()) && uvcCamera != null) {
                Log.i(TAG, "Already connected to " + device.getDeviceName());
                return;
            }

            if (usbMonitor != null && backgroundHandler != null) {
                backgroundHandler.post(() -> {
                    try {
                        usbMonitor.requestPermission(device);
                    } catch (Exception e) {
                        Log.e(TAG, "requestPermission failed: " + e.getMessage());
                    }
                });
            }
        } catch (Exception e) {
            Log.e(TAG, "tryOpenUVCCameraDirect error: " + e.getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // UVC Device Detection
    // ═══════════════════════════════════════════════════════════════

    private boolean isUVCDevice(UsbDevice device) {
        // Check by interface class (UVC = Video class 14 or 239 subclass 2)
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface iface = device.getInterface(i);
            if (iface.getInterfaceClass() == 14 || iface.getInterfaceClass() == 239) {
                Log.i(TAG, "UVC detected by interface class: " + iface.getInterfaceClass());
                return true;
            }
        }
        // Check by known Vendor IDs
        int vid = device.getVendorId();
        if (vid == VENDOR_MACROSILICON || vid == VENDOR_FUSHICAI || vid == VENDOR_MAGEWELL) {
            Log.i(TAG, "UVC detected by VendorID: 0x" + Integer.toHexString(vid));
            return true;
        }
        // Heuristic: class 239 subclass 2
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface iface = device.getInterface(i);
            if (iface.getInterfaceClass() == 239 && iface.getInterfaceSubclass() == 2) {
                Log.i(TAG, "UVC detected by class/subclass 239/2");
                return true;
            }
        }
        return false;
    }

    private void updateAvailableCameras() {
        JSONArray camerasArray = new JSONArray();
        for (Map.Entry<String, UsbDevice> entry : discoveredDevices.entrySet()) {
            UsbDevice device = entry.getValue();
            int vid = device.getVendorId();
            String label;
            if (vid == VENDOR_MACROSILICON) label = "USB: MacroSilicon Capture (0x" + Integer.toHexString(vid) + ")";
            else if (vid == VENDOR_FUSHICAI) label = "USB: Fushicai Capture (0x" + Integer.toHexString(vid) + ")";
            else if (vid == VENDOR_MAGEWELL) label = "USB: Magewell Capture (0x" + Integer.toHexString(vid) + ")";
            else label = "USB: UVC Device (0x" + Integer.toHexString(vid) + ")";

            try {
                JSONObject cam = new JSONObject();
                cam.put("id", entry.getKey());
                cam.put("label", label);
                cam.put("isExternal", true);
                camerasArray.put(cam);
            } catch (Exception e) {}
        }

        JSObject ret = new JSObject();
        ret.put("cameras", camerasArray);
        notifyListeners("uvc:cameras", ret);

        Log.i(TAG, "Available cameras: " + camerasArray.length());
    }

    // ═══════════════════════════════════════════════════════════════
    // Enumerate cameras (called from JS)
    // ═══════════════════════════════════════════════════════════════

    @PluginMethod
    public void enumerateCameras(PluginCall call) {
        JSONArray camerasArray = new JSONArray();
        for (Map.Entry<String, UsbDevice> entry : discoveredDevices.entrySet()) {
            UsbDevice device = entry.getValue();
            int vid = device.getVendorId();
            String label;
            if (vid == VENDOR_MACROSILICON) label = "USB: MacroSilicon Capture";
            else if (vid == VENDOR_FUSHICAI) label = "USB: Fushicai Capture";
            else if (vid == VENDOR_MAGEWELL) label = "USB: Magewell Capture";
            else label = "USB: UVC Device (0x" + Integer.toHexString(vid) + ")";

            try {
                JSONObject cam = new JSONObject();
                cam.put("id", entry.getKey());
                cam.put("label", label);
                cam.put("isExternal", true);
                camerasArray.put(cam);
            } catch (Exception e) {}
        }

        JSObject ret = new JSObject();
        ret.put("cameras", camerasArray);
        ret.put("count", camerasArray.length());
        call.resolve(ret);
    }

    // ═══════════════════════════════════════════════════════════════
    // Open UVC Camera
    // ═══════════════════════════════════════════════════════════════

    @PluginMethod
    public void openCamera(PluginCall call) {
        String deviceName = call.getString("deviceName", "");

        if (deviceName.isEmpty()) {
            // Auto-select first available
            if (!discoveredDevices.isEmpty()) {
                deviceName = discoveredDevices.keySet().iterator().next();
            }
        }

        if (deviceName.isEmpty()) {
            call.reject("No UVC camera available");
            return;
        }

        UsbDevice device = discoveredDevices.get(deviceName);
        if (device == null) {
            call.reject("Device not found: " + deviceName);
            return;
        }

        UsbManager usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        if (usbManager == null) {
            call.reject("UsbManager not available");
            return;
        }

        // v4.7.52: Permission flow — request if needed, then trigger onConnect async.
        // The JS side gets success immediately; the actual camera opening happens
        // asynchronously via onConnect → openUVCCamera() and is announced via the
        // "uvc:opened" event.
        //
        // Previously this rejected with "Requesting USB permission" which caused
        // the JS layer to fall through to getUserMedia (which can't see UVC devices
        // → OverconstrainedError).
        if (!usbManager.hasPermission(device)) {
            Log.i(TAG, "openCamera: requesting USB permission for " + deviceName);
            requestUsbPermission(device);
            // Resolve now — onConnect will fire after user grants permission.
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("deviceName", deviceName);
            ret.put("permissionRequested", true);
            call.resolve(ret);
            return;
        }

        // Already have permission — trigger onConnect by calling requestPermission
        // (USBMonitor will immediately fire onConnect if device is already permitted).
        if (usbMonitor != null) {
            Log.i(TAG, "openCamera: already permitted, triggering onConnect for " + deviceName);
            try {
                usbMonitor.requestPermission(device);
            } catch (Exception e) {
                Log.w(TAG, "usbMonitor.requestPermission failed (already permitted): " + e.getMessage());
                // Fallback: try opening directly
                tryOpenUVCCameraDirect(device);
            }
        } else {
            Log.w(TAG, "openCamera: usbMonitor is null, trying direct open");
            tryOpenUVCCameraDirect(device);
        }

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("deviceName", deviceName);
        call.resolve(ret);
    }

    private void openUVCCamera(UsbDevice device, USBMonitor.UsbControlBlock ctrlBlock) {
        Log.i(TAG, "═══════════════════════════════════════════════════");
        Log.i(TAG, "openUVCCamera: " + device.getDeviceName());
        Log.i(TAG, "  VID=0x" + Integer.toHexString(device.getVendorId()) + " PID=0x" + Integer.toHexString(device.getProductId()));
        Log.i(TAG, "═══════════════════════════════════════════════════");

        closeUVCCamera();

        try {
            UVCCamera camera = new UVCCamera();
            uvcCamera = camera;

            // Step 1: Open camera
            camera.open(ctrlBlock);
            Log.i(TAG, "★ UVCCamera opened successfully");

            // Step 2: Set preview size — MJPEG forced (MacroSilicon fix)
            try {
                Log.i(TAG, "★ Trying setPreviewSize(" + PREVIEW_WIDTH + "x" + PREVIEW_HEIGHT + ", MJPEG, bw=" + BANDWIDTH_FACTOR + ")");
                camera.setPreviewSize(PREVIEW_WIDTH, PREVIEW_HEIGHT, PREVIEW_MIN_FPS, PREVIEW_MAX_FPS, PREVIEW_FORMAT, BANDWIDTH_FACTOR);
                Log.i(TAG, "★ Preview size set: " + PREVIEW_WIDTH + "x" + PREVIEW_HEIGHT + " MJPEG");
            } catch (Exception e1) {
                Log.w(TAG, "1280x720 MJPEG bw failed: " + e1.getMessage() + ", trying without bw...");
                try {
                    camera.setPreviewSize(PREVIEW_WIDTH, PREVIEW_HEIGHT, PREVIEW_FORMAT);
                    Log.i(TAG, "★ Preview size set: " + PREVIEW_WIDTH + "x" + PREVIEW_HEIGHT + " MJPEG (no bw)");
                } catch (Exception e2) {
                    Log.w(TAG, "1280x720 failed: " + e2.getMessage() + ", trying 640x480...");
                    try {
                        camera.setPreviewSize(640, 480, PREVIEW_MIN_FPS, PREVIEW_MAX_FPS, UVCCamera.FRAME_FORMAT_MJPEG, BANDWIDTH_FACTOR);
                        Log.i(TAG, "★ Preview size set: 640x480 MJPEG");
                    } catch (Exception e3) {
                        Log.w(TAG, "640x480 bw failed: " + e3.getMessage() + ", trying 640x480 simple...");
                        try {
                            camera.setPreviewSize(640, 480, UVCCamera.FRAME_FORMAT_MJPEG);
                            Log.i(TAG, "★ Preview size set: 640x480 MJPEG (no bw)");
                        } catch (Exception e4) {
                            Log.e(TAG, "ALL preview size attempts failed! " + e4.getMessage());
                            closeUVCCamera();
                            return;
                        }
                    }
                }
            }

            // Step 3: Setup preview surface (TextureView)
            ensureTextureView();
            if (textureView != null) {
                mainHandler.post(() -> setupPreviewSurface());
            }

            // Step 4: Set capture callback for photo
            // camera.setFrameCallback(mFrameCallback, UVCCamera.PIXEL_FORMAT_JPEG); // API TBD

            // Notify JS
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("deviceName", device.getDeviceName());
            notifyListeners("uvc:opened", ret);

            Log.i(TAG, "★ UVC Camera fully opened and preview started");

        } catch (Exception e) {
            Log.e(TAG, "openUVCCamera FAILED: " + e.getMessage(), e);
            closeUVCCamera();
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", e.getMessage());
            notifyListeners("uvc:error", ret);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Preview Surface — TextureView overlay
    // ═══════════════════════════════════════════════════════════════

    private void ensureTextureView() {
        if (textureView != null) return;

        try {
            Activity activity = getActivity();
            if (activity == null) return;

            mainHandler.post(() -> {
                try {
                    ViewGroup rootView = (ViewGroup) activity.findViewById(android.R.id.content);
                    if (rootView == null) return;

                    // v4.7.53: Container is MATCH_PARENT (fills screen).
                    // TextureView inside it is AutoFit — respects targetAspectRatio.
                    textureContainer = new FrameLayout(activity);
                    FrameLayout.LayoutParams containerParams = new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                    );
                    textureContainer.setLayoutParams(containerParams);

                    // v4.7.53: AutoFitTextureView measures itself based on targetAspectRatio.
                    // Gravity CENTER so it's centered within the container.
                    // v4.7.57: CRITICAL — apply stored targetAspectRatio to the AutoFitTextureView
                    // when it's created. Without this, AutoFitTextureView defaults to ratio=0 (fill
                    // parent) and ignores all setAspectRatio calls made before textureView existed.
                    // This was the root cause of "rasio tidak berfungsi ke live view".
                    textureView = new AutoFitTextureView(activity);
                    textureView.setAspectRatio(targetAspectRatio);  // Apply stored ratio!
                    FrameLayout.LayoutParams tvParams = new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        android.view.Gravity.CENTER
                    );
                    textureView.setLayoutParams(tvParams);
                    textureContainer.addView(textureView);

                    rootView.addView(textureContainer, 0);
                    Log.i(TAG, "TextureView overlay created (AutoFit, ratio=" + targetAspectRatio + ")");
                } catch (Exception e) {
                    Log.e(TAG, "ensureTextureView failed: " + e.getMessage(), e);
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "ensureTextureView outer failed: " + e.getMessage());
        }
    }

    private void setupPreviewSurface() {
        if (uvcCamera == null || textureView == null) return;

        try {
            if (!textureView.isAvailable()) {
                textureView.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
                    @Override
                    public void onSurfaceTextureAvailable(SurfaceTexture surface, int width, int height) {
                        startPreviewWithSurface(surface);
                    }
                    @Override
                    public void onSurfaceTextureSizeChanged(SurfaceTexture surface, int width, int height) {}
                    @Override
                    public boolean onSurfaceTextureDestroyed(SurfaceTexture surface) { return true; }
                    @Override
                    public void onSurfaceTextureUpdated(SurfaceTexture surface) {}
                });
            } else {
                startPreviewWithSurface(textureView.getSurfaceTexture());
            }
        } catch (Exception e) {
            Log.e(TAG, "setupPreviewSurface failed: " + e.getMessage());
        }
    }

    private void startPreviewWithSurface(SurfaceTexture surfaceTexture) {
        if (uvcCamera == null || surfaceTexture == null) return;

        try {
            surfaceTexture.setDefaultBufferSize(PREVIEW_WIDTH, PREVIEW_HEIGHT);
            previewSurface = new Surface(surfaceTexture);
            uvcCamera.setPreviewDisplay(previewSurface);
            uvcCamera.startPreview();
            Log.i(TAG, "★ UVC Preview started on TextureView");
        } catch (Exception e) {
            Log.e(TAG, "startPreviewWithSurface failed: " + e.getMessage(), e);
        }
    }

    private void showTextureView() {
        mainHandler.post(() -> {
            if (textureContainer != null) {
                textureContainer.setVisibility(View.VISIBLE);
            }
        });
    }

    private void hideTextureView() {
        mainHandler.post(() -> {
            if (textureContainer != null) {
                textureContainer.setVisibility(View.GONE);
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // Photo Capture
    // ═══════════════════════════════════════════════════════════════

    // v4.7.47: IFrameCallback TBD — API mungkin berbeda di v0.0.13
    // private final IFrameCallback mFrameCallback = new IFrameCallback() {
    //     @Override
    //     public void onFrame(ByteBuffer frame) {}
    // };

    @PluginMethod
    public void capturePhoto(PluginCall call) {
        if (uvcCamera == null || textureView == null) {
            call.reject("UVC camera not opened");
            return;
        }

        android.graphics.Bitmap bitmap = null;
        try {
            bitmap = textureView.getBitmap();
            if (bitmap == null) {
                call.reject("Failed to capture bitmap from TextureView");
                return;
            }

            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            try {
                bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, baos);
                byte[] bytes = baos.toByteArray();
                String base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP);

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("base64", base64);
                ret.put("width", bitmap.getWidth());
                ret.put("height", bitmap.getHeight());
                call.resolve(ret);
            } finally {
                try { baos.close(); } catch (Exception e) {}
            }
        } catch (Exception e) {
            Log.e(TAG, "capturePhoto failed: " + e.getMessage(), e);
            call.reject("Capture failed: " + e.getMessage());
        } finally {
            // v4.7.56: CRITICAL — recycle Bitmap to prevent native OOM.
            // textureView.getBitmap() allocates ~3.7MB native memory per call (1280x720 ARGB_8888).
            // Without recycle, at 15fps video recording = 55MB/s native leak → OOM → phone restart.
            if (bitmap != null && !bitmap.isRecycled()) {
                try { bitmap.recycle(); } catch (Exception e) {}
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Close / Cleanup
    // ═══════════════════════════════════════════════════════════════

    private void closeUVCCamera() {
        try {
            if (uvcCamera != null) {
                uvcCamera.stopPreview();
                uvcCamera.close();
                uvcCamera = null;
            }
        } catch (Exception e) {
            Log.w(TAG, "closeUVCCamera error: " + e.getMessage());
        }
        if (previewSurface != null) {
            previewSurface.release();
            previewSurface = null;
        }
        // v4.7.58: DO NOT hideTextureView here — keep preview visible so capturePhoto
        // (textureView.getBitmap) still works. Hide is only needed when switching
        // to review/result phases, which is handled by hidePreview() from JS.
        // Also: do NOT destroy textureView — it will be reused on next openCamera.
        // Previous bug: closeUVCCamera → hideTextureView → next capturePhoto returned
        // null bitmap (view GONE) → JS error → user had to restart.
    }

    private void handleDeviceDisconnect(UsbDevice device) {
        if (currentUsbDevice != null && currentUsbDevice.getDeviceName().equals(device.getDeviceName())) {
            closeUVCCamera();
            // v4.7.58: Clear these so next openCamera re-initializes properly
            currentUsbDevice = null;
            currentCtrlBlock = null;
            notifyListeners("uvc:disconnected", new JSObject());
        }
    }

    @PluginMethod
    public void closeCamera(PluginCall call) {
        closeUVCCamera();
        currentUsbDevice = null;
        currentCtrlBlock = null;
        if (call != null) call.resolve();
    }

    @PluginMethod
    public void showPreview(PluginCall call) {
        showTextureView();
        call.resolve();
    }

    @PluginMethod
    public void hidePreview(PluginCall call) {
        hideTextureView();
        call.resolve();
    }

    // v4.7.53: Set target aspect ratio for TextureView.
    // JS calls this with { width, height } (e.g. 9, 16 for portrait 9:16).
    // The AutoFitTextureView will constrain itself to that ratio, centered on screen.
    // This prevents the UVC preview from stretching/exceeding the screen when the
    // camera's native 16:9 output doesn't match the user's selected aspect ratio.
    // v4.7.57: targetAspectRatio is stored as a field, so even if textureView is
    // null when this is called (async creation), the ratio will be applied when
    // ensureTextureView creates the AutoFitTextureView.
    @PluginMethod
    public void setAspectRatio(PluginCall call) {
        int w = call.getInt("width", 0);
        int h = call.getInt("height", 0);
        if (w > 0 && h > 0) {
            targetAspectRatio = (float) w / (float) h;
        } else {
            targetAspectRatio = 0f;  // fill screen
        }
        Log.i(TAG, "setAspectRatio: " + w + "x" + h + " → ratio=" + targetAspectRatio + " (textureView exists: " + (textureView != null) + ")");

        // Apply to existing TextureView (if created). If not yet created,
        // targetAspectRatio is already stored and will be applied in ensureTextureView.
        mainHandler.post(() -> {
            if (textureView != null) {
                textureView.setAspectRatio(targetAspectRatio);
                // v4.7.57: Force both requestLayout AND invalidate to ensure
                // onMeasure is called again with the new ratio.
                textureView.requestLayout();
                textureView.invalidate();
            }
            if (textureContainer != null) {
                textureContainer.requestLayout();
            }
        });

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("ratio", targetAspectRatio);
        ret.put("textureViewExists", textureView != null);
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        closeUVCCamera();
        stopUsbPolling();
        try {
            if (usbMonitor != null) {
                usbMonitor.unregister();
                usbMonitor = null;
            }
        } catch (Exception e) {}
        if (usbPermissionReceiver != null) {
            try { getContext().unregisterReceiver(usbPermissionReceiver); } catch (Exception e) {}
            usbPermissionReceiver = null;
        }
        // Remove TextureView
        try {
            Activity activity = getActivity();
            if (activity != null && textureContainer != null) {
                mainHandler.post(() -> {
                    try {
                        ViewGroup rootView = (ViewGroup) activity.findViewById(android.R.id.content);
                        if (rootView != null && textureContainer != null) {
                            rootView.removeView(textureContainer);
                        }
                    } catch (Exception e) {}
                });
            }
        } catch (Exception e) {}
        textureView = null;
        textureContainer = null;
        stopBackgroundThread();
        super.handleOnDestroy();
    }
}

/**
 * v4.7.53: AutoFitTextureView — TextureView that respects a target aspect ratio.
 *
 * Standard TextureView with MATCH_PARENT stretches the camera preview to fill
 * the entire screen. For UVC cameras (native 1280x720 = 16:9) on a portrait
 * phone screen (9:16), this distorts the preview or makes it exceed the screen.
 *
 * AutoFitTextureView overrides onMeasure to constrain itself to the target
 * aspect ratio (width / height). The view is centered within its parent
 * (FrameLayout with Gravity.CENTER), so letterboxing/pillarboxing appears
 * as transparent margins — letting the WebView background show through.
 *
 * Port dari Android Camera2 API sample code (AutoFitTextureView.java).
 */
class AutoFitTextureView extends TextureView {
    private float aspectRatio = 0f;  // width / height, 0 = fill parent

    public AutoFitTextureView(Context context) {
        super(context);
    }

    /**
     * Set target aspect ratio (width / height).
     * 0 = fill parent (MATCH_PARENT behavior).
     * Non-zero = constrain to ratio, centered.
     */
    public void setAspectRatio(float ratio) {
        if (ratio < 0) ratio = 0;
        if (this.aspectRatio != ratio) {
            this.aspectRatio = ratio;
            requestLayout();
        }
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int parentWidth = MeasureSpec.getSize(widthMeasureSpec);
        int parentHeight = MeasureSpec.getSize(heightMeasureSpec);

        if (aspectRatio <= 0 || parentWidth <= 0 || parentHeight <= 0) {
            // No ratio constraint — fill parent
            super.onMeasure(widthMeasureSpec, heightMeasureSpec);
            return;
        }

        // Calculate child dimensions that fit within parent while respecting aspectRatio.
        // ratio = childWidth / childHeight
        int childWidth, childHeight;

        float parentRatio = (float) parentWidth / (float) parentHeight;
        if (parentRatio > aspectRatio) {
            // Parent is wider than target → constrain by height, crop/pillarbox width
            childHeight = parentHeight;
            childWidth = Math.round(childHeight * aspectRatio);
        } else {
            // Parent is taller than target → constrain by width, crop/letterbox height
            childWidth = parentWidth;
            childHeight = Math.round(childWidth / aspectRatio);
        }

        setMeasuredDimension(childWidth, childHeight);
    }
}
