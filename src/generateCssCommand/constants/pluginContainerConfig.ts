// src/generateCssCommand/constants/pluginContainerConfig.ts

/**
 * pluginContainerConfig
 * เก็บ mapping ระหว่าง "funcName" (เช่น "drawer-container") -> ชื่อ class container
 * เช่น "drawerPluginContainer" สำหรับไปใช้ใน buildCssText
 */
export const pluginContainerConfig: Record<string, string> = {
  'drawer-container': 'drawerPluginContainer',
  'dialog-container': 'dialogPluginContainer',
  'snackbar-container': 'snackbarPluginContainer',
  'popover-container': 'popoverPluginContainer',
};

export const pluginContainerConfigSuggestion = {
  'drawer-container': 'drawer-container (container)',
  'dialog-container': 'dialog-container (container)',
  'snackbar-container': 'snackbar-container (container)',
  'popover-container': 'popover-container (container)',
};
