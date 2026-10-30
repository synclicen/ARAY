#!/usr/bin/env python3
"""
Patch AndroidManifest.xml — inject USB_DEVICE_ATTACHED intent-filter + meta-data
into the MainActivity <activity> block. Without this, Android does NOT auto-grant
USB permission when a UVC capture card is plugged in — the user has to approve
a dialog every time.

Port dari Saatiril-Andro AndroidManifest.xml (lines 70-76).

Usage: python3 patch-manifest-usb.py <path/to/AndroidManifest.xml>
"""
import re
import sys

def patch(path: str) -> None:
    with open(path) as f:
        content = f.read()

    if "USB_DEVICE_ATTACHED" in content:
        print("OK USB_DEVICE_ATTACHED intent-filter already present")
        return

    usb_block = """
            <!-- v4.7.52: Handle USB device attachment (UVC capture card) — auto-grant permission -->
            <intent-filter>
                <action android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED" />
            </intent-filter>
            <meta-data
                android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED"
                android:resource="@xml/device_filter" />
"""

    # Try to find MainActivity <activity> block first
    pattern = r'(<activity[^>]*android:name="[^"]*MainActivity"[^>]*>)(.*?)(</activity>)'
    match = re.search(pattern, content, re.DOTALL)
    if match:
        new_activity = match.group(1) + match.group(2) + usb_block + match.group(3)
        content = content[:match.start()] + new_activity + content[match.end():]
        with open(path, "w") as f:
            f.write(content)
        print("OK Injected USB_DEVICE_ATTACHED intent-filter into MainActivity")
        return

    # Fallback: inject into first <activity> block
    pattern = r'(<activity[^>]*>)(.*?)(</activity>)'
    match = re.search(pattern, content, re.DOTALL)
    if match:
        new_activity = match.group(1) + match.group(2) + usb_block + match.group(3)
        content = content[:match.start()] + new_activity + content[match.end():]
        with open(path, "w") as f:
            f.write(content)
        print("OK Injected USB_DEVICE_ATTACHED intent-filter into first activity (fallback)")
        return

    print("WARN: No <activity> block found in AndroidManifest", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: patch-manifest-usb.py <AndroidManifest.xml>", file=sys.stderr)
        sys.exit(1)
    patch(sys.argv[1])
