function colorHex(value) {
  return `#${value.toString(16).padStart(6, '0')}`;
}

/**
 * @param {{
 *   carWrap: HTMLElement,
 *   modeWrap: HTMLElement,
 *   carConfigs: Record<string, object>,
 *   modeConfigs: Record<string, object>,
 *   state: { selectedCar: string, selectedMode: string },
 *   rickshawUnlocked: boolean,
 *   onCar: (id: string) => void,
 *   onMode: (id: string) => void,
 * }} p
 */
export function buildPicker(p) {
  const { carWrap, modeWrap, carConfigs, modeConfigs, state, rickshawUnlocked, onCar, onMode } = p;
  carWrap.innerHTML = '';
  for (const [id, carDef] of Object.entries(carConfigs)) {
    const locked = carDef.lockedUntilFirstRun === true && !rickshawUnlocked;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `card ${id === state.selectedCar ? 'is-selected' : ''} ${locked ? 'is-locked' : ''}`;
    button.disabled = locked;
    button.innerHTML = `
      <span class="mini-car" style="--car:${colorHex(carDef.color)}"></span>
      <strong>${carDef.name}${locked ? ' 🔒' : ''}</strong>
      <small>${locked ? 'Finish any run once to unlock.' : carDef.caption}</small>
      ${Object.entries(carDef.stats)
        .map(
          ([label, value]) =>
            `<span class="stat"><b>${label}</b><i><em style="width:${value}%"></em></i></span>`
        )
        .join('')}
    `;
    button.addEventListener('click', () => {
      if (locked) return;
      onCar(id);
    });
    carWrap.appendChild(button);
  }

  modeWrap.innerHTML = '';
  for (const [id, mode] of Object.entries(modeConfigs)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mode ${id === state.selectedMode ? 'is-selected' : ''}`;
    button.innerHTML = `<strong>${mode.name}</strong><span>${mode.goal}</span>`;
    button.addEventListener('click', () => onMode(id));
    modeWrap.appendChild(button);
  }
}
