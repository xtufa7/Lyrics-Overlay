import type{Settings}from'../shared/model';
export function configureSurface(node:HTMLElement,s:Settings){
 node.dataset.surface=s.surface;
 node.style.setProperty('--surface-color',s.surfaceColor);
 node.style.setProperty('--surface-opacity',String(s.surfaceOpacity));
 node.style.setProperty('--surface-radius',`${s.surfaceRadius}px`);
 node.style.setProperty('--surface-border',s.surfaceBorder);
}
