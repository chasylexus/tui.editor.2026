const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvgIcon(viewBox: string) {
  const svg = document.createElementNS(SVG_NS, 'svg');

  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  return svg;
}

export function SunIcon() {
  const svg = createSvgIcon('0 0 24 24');
  const circle = document.createElementNS(SVG_NS, 'circle');

  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '4');
  svg.appendChild(circle);

  const rays = [
    ['12', '1', '12', '3'],
    ['12', '21', '12', '23'],
    ['4.22', '4.22', '5.64', '5.64'],
    ['18.36', '18.36', '19.78', '19.78'],
    ['1', '12', '3', '12'],
    ['21', '12', '23', '12'],
    ['4.22', '19.78', '5.64', '18.36'],
    ['18.36', '5.64', '19.78', '4.22'],
  ];

  rays.forEach(([x1, y1, x2, y2]) => {
    const line = document.createElementNS(SVG_NS, 'line');

    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    svg.appendChild(line);
  });

  return svg;
}

export function MoonIcon() {
  const svg = createSvgIcon('0 0 24 24');
  const path = document.createElementNS(SVG_NS, 'path');

  path.setAttribute('d', 'M21 14.5A8.5 8.5 0 0 1 9.5 3 9.5 9.5 0 1 0 21 14.5Z');
  svg.appendChild(path);

  return svg;
}

export function AutoIcon() {
  const svg = createSvgIcon('0 0 24 24');
  const left = document.createElementNS(SVG_NS, 'line');
  const right = document.createElementNS(SVG_NS, 'line');
  const crossbar = document.createElementNS(SVG_NS, 'line');

  left.setAttribute('x1', '6');
  left.setAttribute('y1', '20');
  left.setAttribute('x2', '12');
  left.setAttribute('y2', '4');
  svg.appendChild(left);

  right.setAttribute('x1', '18');
  right.setAttribute('y1', '20');
  right.setAttribute('x2', '12');
  right.setAttribute('y2', '4');
  svg.appendChild(right);

  crossbar.setAttribute('x1', '9');
  crossbar.setAttribute('y1', '14');
  crossbar.setAttribute('x2', '15');
  crossbar.setAttribute('y2', '14');
  svg.appendChild(crossbar);

  return svg;
}

export const themeIcons = {
  light: SunIcon,
  auto: AutoIcon,
  dark: MoonIcon,
};
