import tagsData from '../../data/tags.json';
import type { IconMetadata } from '../../domain/entities/icon';

const STYLES = ['line', 'fill'] as const;

export function loadIconsFromTags(): IconMetadata[] {
  const icons: IconMetadata[] = [];
  
  for (const [category, iconMap] of Object.entries(tagsData)) {
    if (category === '_comment' || typeof iconMap !== 'object') continue;
    
    for (const [baseName, tagString] of Object.entries(iconMap)) {
      const tags = tagString.split(',').map(t => t.trim()).filter(Boolean);
      
      for (const style of STYLES) {
        const name = `${baseName}-${style}`;
        icons.push({
          name,
          path: `icons/${category}/${name}.svg`,
          category,
          style,
          usage: `${style} ${baseName} icon for ${category.toLowerCase()} related functionality`,
          baseName,
          tags,
        });
      }
    }
  }
  
  return icons;
}
