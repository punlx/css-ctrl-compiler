// src/generateCssCommand/constants/pluginStatesConfig.ts

export const pluginStatesConfig: Record<string, Record<string, string>> = {
  // ตัวอย่าง plugin "option" => mapping suffix -> "className[optionalAttr]"
  option: {
    active: 'listboxPlugin-active',
    selected: 'listboxPlugin-selected[aria-selected="true"]',
    unselected: 'listboxPlugin-unselected[aria-selected="false"]',
    disabled: 'listboxPlugin-disabled[aria-disabled="true"]',
  },

  // ตัวอย่าง plugin "accordion"
  accordion: {
    active: 'accordionPlugin-active',
    expanded: 'accordionPlugin-expanded[aria-expanded="true"]',
    collapsed: 'accordionPlugin-collapsed[aria-expanded="false"]',
    disabled: 'accordionPlugin-disabled[aria-disabled="true"]',
  },

  // คุณสามารถเพิ่ม plugin อื่น ๆ ได้ในรูปแบบเดียวกัน
};

export const pluginStatePseudos = [
  'option-active',
  'option-selected',
  'option-unselected',
  'option-disabled',
  'accordion-active',
  'accordion-expanded',
  'accordion-collapsed',
  'accordion-disabled',
];
