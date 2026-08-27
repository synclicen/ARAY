!macro customInit
  ; Check if VCRUNTIME140.dll exists in System32
  ; If not, run vc_redist.x64.exe silently before installing ARAY
  IfFileExists "$SYSDIR\VCRUNTIME140.dll" skipVcredist 0

  DetailPrint "Installing Visual C++ Redistributable..."
  ; vc_redist.x64.exe is in EXTRAFILES so it's in install dir
  ; Use $PLUGINSDIR as temp location
  SetOutPath "$PLUGINSDIR"
  File "${BUILD_RESOURCES_DIR}\vc_redist.x64.exe"
  ExecWait '"$PLUGINSDIR\vc_redist.x64.exe" /install /quiet /norestart' $0
  DetailPrint "VC++ Redistributable installer exited with code: $0"

  skipVcredist:
!macroend
