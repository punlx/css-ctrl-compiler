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

const pluginStates = Object.entries(pluginStatesConfig).flatMap(([key, val]) => {
  return Object.entries(val).flatMap(([key2, val2]) => {
    const name = `${key}-${key2}`;
    return {
      pseudos: `:${name}`,
      arrMapSuggestion: {
        [name]: `${name} (state)`,
      },
    };
  });
});

const pluginMapSuggestion = () => {
  const map: Record<string, string> = {};
  for (let index = 0; index < pluginStates.length; index++) {
    const element = pluginStates[index].arrMapSuggestion;
    const [[key, val]] = Object.entries(element);
    map[key] = val;
  }
  return map;
};

export const pluginMapSuggestionList = pluginMapSuggestion();
export const pluginStatePseudos = pluginStates.map((res) => res.pseudos);
