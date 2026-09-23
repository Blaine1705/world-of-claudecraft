// Details!-style full options configuration dialog for World of ClaudeCraft combat meters.
// Provides live two-column settings with instant preview, customizable bar geometry,
// texture shaders, number formats, header telemetry, and one-click presets.

import { markDialogRoot } from './dialog_root';
import {
  DEFAULT_METERS_SETTINGS,
  exportProfileString,
  FONT_OPTIONS,
  getActiveProfileName,
  importProfileString,
  loadProfiles,
  type MeterBarTexture,
  type MeterFontFamily,
  type MeterNumberFormat,
  type MeterOpacity,
  type MetersSettings,
  type MeterThemePreset,
  PRESETS,
  saveProfiles,
  setActiveProfileName,
} from './meters_settings';
import { svgIcon } from './ui_icons';

export type OptionsTab = 'general' | 'bars' | 'text' | 'header' | 'combat' | 'presets' | 'profiles';

export interface MetersOptionsDialogDeps {
  getSettings(): MetersSettings;
  onSettingsChanged(settings: MetersSettings): void;
  onClose?(): void;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

export class MetersOptionsDialog {
  private overlayEl: HTMLElement | null = null;
  private dialogEl: HTMLElement | null = null;
  private contentEl: HTMLElement | null = null;
  private activeTab: OptionsTab = 'general';
  private isOpen = false;
  private keydownHandler: ((ev: KeyboardEvent) => void) | null = null;

  constructor(private readonly deps: MetersOptionsDialogDeps) {}

  open(): void {
    if (this.isOpen) return;
    this.ensureDom();
    this.isOpen = true;
    this.overlayEl!.style.display = 'flex';
    this.renderTabs();
    this.renderActiveContent();

    this.keydownHandler = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        this.close();
      }
    };
    window.addEventListener('keydown', this.keydownHandler, true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.overlayEl) {
      this.overlayEl.style.display = 'none';
    }
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler, true);
      this.keydownHandler = null;
    }
    this.deps.onClose?.();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  destroy(): void {
    this.close();
    if (this.overlayEl && this.overlayEl.parentNode) {
      this.overlayEl.parentNode.removeChild(this.overlayEl);
    }
    this.overlayEl = null;
    this.dialogEl = null;
    this.contentEl = null;
  }

  private ensureDom(): void {
    if (this.overlayEl && this.overlayEl.isConnected) return;

    const existing = document.getElementById('meters-options-modal');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'meters-options-modal';
    overlay.className = 'mt-opts-overlay';
    overlay.style.display = 'none';

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) {
        this.close();
      }
    });

    const dialog = document.createElement('div');
    dialog.className = 'mt-opts-dialog panel';
    markDialogRoot(dialog, { label: 'Ajustes de Details y Medidores', modal: true });

    // Header
    const header = document.createElement('div');
    header.className = 'mt-opts-header';
    header.innerHTML = `
      <div class="mt-opts-title-wrap">
        <span class="mt-opts-title">Ajustes de Details / Medidores</span>
        <span class="mt-opts-badge">WoC Details! Engine</span>
      </div>
      <button type="button" class="x-btn mt-opts-close" title="Cerrar" aria-label="Cerrar">${svgIcon('close')}</button>
    `;
    const closeBtn = header.querySelector('.mt-opts-close') as HTMLElement;
    closeBtn.addEventListener('click', () => this.close());

    // Body: sidebar + content
    const body = document.createElement('div');
    body.className = 'mt-opts-body';

    const sidebar = document.createElement('div');
    sidebar.className = 'mt-opts-sidebar';

    const content = document.createElement('div');
    content.className = 'mt-opts-content';

    body.appendChild(sidebar);
    body.appendChild(content);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'mt-opts-footer';
    footer.innerHTML = `
      <button type="button" class="mt-opts-btn mt-opts-btn-reset">Restablecer por defecto</button>
      <div class="mt-opts-footer-spacer"></div>
      <button type="button" class="mt-opts-btn mt-opts-btn-primary mt-opts-btn-done">Cerrar</button>
    `;

    const resetBtn = footer.querySelector('.mt-opts-btn-reset') as HTMLElement;
    resetBtn.addEventListener('click', () => {
      this.deps.onSettingsChanged({ ...DEFAULT_METERS_SETTINGS });
      this.renderActiveContent();
    });

    const doneBtn = footer.querySelector('.mt-opts-btn-done') as HTMLElement;
    doneBtn.addEventListener('click', () => this.close());

    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    this.overlayEl = overlay;
    this.dialogEl = dialog;
    this.contentEl = content;
  }

  private renderTabs(): void {
    if (!this.dialogEl) return;
    const sidebar = this.dialogEl.querySelector('.mt-opts-sidebar') as HTMLElement;
    if (!sidebar) return;

    const tabs: { id: OptionsTab; label: string; desc: string }[] = [
      { id: 'general', label: 'Ventana y Fondo', desc: 'Opacidad, escala, bloqueo' },
      { id: 'bars', label: 'Barras y Texturas', desc: 'Altura, espaciado, animacion' },
      { id: 'text', label: 'Texto y Tipografia', desc: 'Fuentes, k/M, DPS, clasif' },
      { id: 'header', label: 'Cabecera y Titulo', desc: 'Total de grupo, botones' },
      { id: 'combat', label: 'Combate y Limites', desc: 'Filas maximas, escudos' },
      { id: 'presets', label: 'Temas Rapidos', desc: 'Presets de 1 clic' },
      { id: 'profiles', label: 'Perfiles e Importar', desc: 'Exportar, importar y perfiles' },
    ];

    sidebar.innerHTML = '';
    for (const t of tabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `mt-opts-tab-btn${this.activeTab === t.id ? ' active' : ''}`;
      btn.innerHTML = `
        <span class="mt-opts-tab-title">${t.label}</span>
        <span class="mt-opts-tab-desc">${t.desc}</span>
      `;
      btn.addEventListener('click', () => {
        this.activeTab = t.id;
        this.renderTabs();
        this.renderActiveContent();
      });
      sidebar.appendChild(btn);
    }
  }

  private renderActiveContent(): void {
    if (!this.contentEl) return;
    this.contentEl.innerHTML = '';

    switch (this.activeTab) {
      case 'general':
        this.renderGeneralTab();
        break;
      case 'bars':
        this.renderBarsTab();
        break;
      case 'text':
        this.renderTextTab();
        break;
      case 'header':
        this.renderHeaderTab();
        break;
      case 'combat':
        this.renderCombatTab();
        break;
      case 'presets':
        this.renderPresetsTab();
        break;
      case 'profiles':
        this.renderProfilesTab();
        break;
    }
  }

  private get s(): MetersSettings {
    return this.deps.getSettings();
  }

  private update(patch: Partial<MetersSettings>): void {
    const updated = { ...this.s, ...patch };
    this.deps.onSettingsChanged(updated);
  }

  // --- TAB 1: General (Ventana y Fondo) ---
  private renderGeneralTab(): void {
    const s = this.s;
    const group = this.createGroup('Fondo y Apariencia de Ventana');

    // Opacity mode
    group.appendChild(
      this.createRadioRow(
        'Modo de Fondo',
        'Estilo visual del panel del medidor.',
        [
          { id: 'glass', label: 'Cristal (Blur)', desc: 'Efecto esmerilado con desenfoque' },
          { id: 'solid', label: 'Solido', desc: 'Panel oscuro de alto contraste' },
          { id: 'minimal', label: 'Minimo', desc: 'Translúcido tenue' },
          { id: 'transparent', label: 'Transparente', desc: 'Sin fondo, solo barras' },
        ],
        s.opacity,
        (val) => {
          this.update({ opacity: val as MeterOpacity });
        },
      ),
    );

    // Custom background alpha slider
    group.appendChild(
      this.createSliderRow(
        'Opacidad de Fondo',
        'Porcentaje de opacidad del fondo de la ventana.',
        20,
        100,
        2,
        s.backgroundAlpha ?? 76,
        '%',
        (val) => {
          this.update({ backgroundAlpha: val });
        },
      ),
    );

    // Window scale
    group.appendChild(
      this.createSliderRow(
        'Escala de la Ventana',
        'Aumenta o reduce el tamaño de escala general del medidor.',
        80,
        130,
        5,
        s.windowScale ?? 100,
        '%',
        (val) => {
          this.update({ windowScale: val });
        },
      ),
    );

    // Lock position
    group.appendChild(
      this.createToggleRow(
        'Bloquear Posicion',
        'Fija la ventana para evitar moverla o redimensionarla accidentalmente en combate.',
        s.locked,
        (checked) => {
          this.update({ locked: checked });
        },
      ),
    );

    this.contentEl!.appendChild(group);
  }

  // --- TAB 2: Barras y Texturas ---
  private renderBarsTab(): void {
    const s = this.s;
    const group = this.createGroup('Geometria y Textura de las Barras');

    // Bar Height
    group.appendChild(
      this.createSliderRow(
        'Altura de Barra',
        'Grosor vertical de cada fila de daño/sanacion (14px compacto a 26px amplio).',
        14,
        26,
        1,
        s.barHeight,
        'px',
        (val) => {
          this.update({ barHeight: val, density: val <= 16 ? 'compact' : 'standard' });
        },
      ),
    );

    // Bar Spacing
    group.appendChild(
      this.createSliderRow(
        'Espaciado entre Barras',
        'Separacion vertical en píxeles entre filas contiguas.',
        0,
        4,
        1,
        s.barSpacing,
        'px',
        (val) => {
          this.update({ barSpacing: val });
        },
      ),
    );

    // Texture
    group.appendChild(
      this.createRadioRow(
        'Textura de las Barras',
        'Acabado visual y sombreado sobre el color de clase.',
        [
          {
            id: 'specular',
            label: 'Especular (Glossy)',
            desc: 'Reflejo superior de luz con bisel',
          },
          { id: 'smooth', label: 'Plano (Smooth)', desc: 'Color limpio plano de clase' },
          { id: 'gradient', label: 'Degradado', desc: 'Gradiente horizontal suave' },
        ],
        s.barTexture,
        (val) => {
          this.update({ barTexture: val as MeterBarTexture });
        },
      ),
    );

    // Animation toggle
    group.appendChild(
      this.createToggleRow(
        'Animacion Suave de Barras',
        'Interpola fluidamente el crecimiento y descenso de barras en tiempo real.',
        s.barAnimation,
        (checked) => {
          this.update({ barAnimation: checked });
        },
      ),
    );

    // Always Show Me
    group.appendChild(
      this.createToggleRow(
        'Mostrarme Siempre (Always Show Me)',
        'Fija siempre la barra de tu personaje abajo si quedas fuera de las filas visibles.',
        s.alwaysShowMe,
        (checked) => {
          this.update({ alwaysShowMe: checked });
        },
      ),
    );

    this.contentEl!.appendChild(group);
  }

  // --- TAB 3: Texto y Numeros ---
  private renderTextTab(): void {
    const s = this.s;
    const group = this.createGroup('Formato de Texto y Telemetria');

    // Number format
    group.appendChild(
      this.createRadioRow(
        'Formato Numerico',
        'Estilo de visualizacion de los totales.',
        [
          { id: 'compact', label: 'Abreviado (k / M)', desc: 'Ejemplo: 145.2k, 1.2M' },
          { id: 'detailed', label: 'Detallado Completo', desc: 'Ejemplo: 145,200, 1,240,500' },
        ],
        s.numberFormat,
        (val) => {
          this.update({ numberFormat: val as MeterNumberFormat });
        },
      ),
    );

    // Show DPS/HPS
    group.appendChild(
      this.createToggleRow(
        'Mostrar Tasa por Segundo (DPS / HPS)',
        'Muestra la tasa de daño o sanacion por segundo en cada barra.',
        s.showDps,
        (checked) => {
          this.update({ showDps: checked });
        },
      ),
    );

    // Show Percent
    group.appendChild(
      this.createToggleRow(
        'Mostrar Porcentaje (%)',
        'Muestra la proporcion porcentual de contribucion sobre el total de la banda.',
        s.showPercent,
        (checked) => {
          this.update({ showPercent: checked });
        },
      ),
    );

    // Show Rank
    group.appendChild(
      this.createToggleRow(
        'Mostrar Posicion (#1, #2...)',
        'Muestra el numero ordinal de clasificacion a la izquierda del nombre.',
        s.showRank,
        (checked) => {
          this.update({ showRank: checked });
        },
      ),
    );

    // Show Class Icon
    group.appendChild(
      this.createToggleRow(
        'Mostrar Icono de Clase',
        'Muestra el icono de la clase o rol del jugador junto a su nombre.',
        s.showClassIcon,
        (checked) => {
          this.update({ showClassIcon: checked });
        },
      ),
    );

    this.contentEl!.appendChild(group);

    // Tipografia de Combate (Fuente de Letra)
    const fontGroup = this.createGroup('Tipografia de Combate (Fuente de Letra)');
    const fontGrid = document.createElement('div');
    fontGrid.className = 'mt-opts-font-grid';

    for (const font of FONT_OPTIONS) {
      const card = document.createElement('div');
      card.className = `mt-opts-font-card${s.fontFamily === font.id ? ' active' : ''}`;
      card.innerHTML = `
        <div class="mt-opts-font-header">
          <span class="mt-opts-font-name">${font.name}</span>
        </div>
        <div class="mt-opts-font-desc">${font.desc}</div>
        <div class="mt-opts-font-preview" style="font-family: ${font.family}">${font.sample}</div>
      `;
      card.addEventListener('click', () => {
        for (const c of fontGrid.querySelectorAll('.mt-opts-font-card')) {
          c.classList.remove('active');
        }
        card.classList.add('active');
        this.update({ fontFamily: font.id });
      });
      fontGrid.appendChild(card);
    }
    fontGroup.appendChild(fontGrid);
    this.contentEl!.appendChild(fontGroup);
  }

  // --- TAB 4: Cabecera y Titulo ---
  private renderHeaderTab(): void {
    const s = this.s;
    const group = this.createGroup('Personalizacion de la Cabecera');

    // Show Title Bar
    group.appendChild(
      this.createToggleRow(
        'Mostrar Barra de Titulo',
        'Muestra la barra superior con el nombre del combate y controles.',
        s.showTitleBar,
        (checked) => {
          this.update({ showTitleBar: checked });
        },
      ),
    );

    // Show Raid Totals
    group.appendChild(
      this.createToggleRow(
        'Resumen de Grupo en Subtitulo',
        'Muestra el total acumulado de DPS y HPS del grupo entero en el subtítulo.',
        s.showRaidTotals,
        (checked) => {
          this.update({ showRaidTotals: checked });
        },
      ),
    );

    this.contentEl!.appendChild(group);
  }

  // --- TAB 5: Combate y Limites ---
  private renderCombatTab(): void {
    const s = this.s;
    const group = this.createGroup('Reglas de Combate y Limites');

    // Max Visible Rows
    group.appendChild(
      this.createSliderRow(
        'Filas Maximas Visibles',
        'Numero de barras simultaneas (0 = ilimitadas, ajustadas al alto de ventana).',
        0,
        15,
        1,
        s.maxVisibleRows,
        s.maxVisibleRows === 0 ? ' (Auto)' : ' barras',
        (val) => {
          this.update({ maxVisibleRows: val });
        },
      ),
    );

    // Include Shields in Heal
    group.appendChild(
      this.createToggleRow(
        'Contabilizar Escudos como Sanacion',
        'Suma el daño absorbido por escudos (Palabra de poder: Escudo, etc.) a la columna de Sanacion.',
        s.includeShieldsInHeal,
        (checked) => {
          this.update({ includeShieldsInHeal: checked });
        },
      ),
    );

    this.contentEl!.appendChild(group);
  }

  // --- TAB 6: Temas y Perfiles (Presets) ---
  private renderPresetsTab(): void {
    const group = this.createGroup('Temas Rapidos de 1 Clic');
    const container = document.createElement('div');
    container.className = 'mt-opts-presets-grid';

    const presetsList: {
      id: Exclude<MeterThemePreset, 'custom'>;
      name: string;
      desc: string;
      badge: string;
    }[] = [
      {
        id: 'details_glass',
        name: 'Details! Modern Glass',
        desc: 'Fondo de cristal esmerilado con desenfoque, barras especulares con brillo, números abreviados y telemetría completa.',
        badge: 'Recomendado',
      },
      {
        id: 'classic',
        name: 'Classic WoW',
        desc: 'Panel sólido oscuro de alto contraste, barras planas de clase, números detallados sin abreviar estilo clásico.',
        badge: 'Retro',
      },
      {
        id: 'minimal',
        name: 'Minimalista Puro',
        desc: 'Fondo casi transparente, barras compactas de 16px sin espaciado, texto directo sin porcentajes.',
        badge: 'Limpio',
      },
      {
        id: 'raid',
        name: 'Raid Focus',
        desc: 'Diseñado para bandas: densidad compacta de 18px, límite de 10 barras, total de grupo visible y fijado personal.',
        badge: 'Banda',
      },
    ];

    for (const p of presetsList) {
      const card = document.createElement('div');
      card.className = `mt-opts-preset-card${this.s.themePreset === p.id ? ' active' : ''}`;
      card.innerHTML = `
        <div class="mt-opts-preset-header">
          <span class="mt-opts-preset-name">${p.name}</span>
          <span class="mt-opts-preset-badge">${p.badge}</span>
        </div>
        <p class="mt-opts-preset-desc">${p.desc}</p>
        <button type="button" class="mt-opts-btn mt-opts-btn-apply">Aplicar Tema</button>
      `;

      const applyBtn = card.querySelector('.mt-opts-btn-apply') as HTMLElement;
      applyBtn.addEventListener('click', () => {
        const patch = PRESETS[p.id];
        if (patch) {
          this.update(patch);
          this.renderActiveContent();
        }
      });

      container.appendChild(card);
    }

    group.appendChild(container);
    this.contentEl!.appendChild(group);
  }

  // --- TAB 7: Perfiles e Importar/Exportar ---
  private renderProfilesTab(): void {
    const storage = this.deps.storage;
    const profiles = loadProfiles(storage);
    const activeProfile = getActiveProfileName(storage);

    // Group 1: Perfil Activo
    const groupManage = this.createGroup('Gestion de Perfiles');
    const manageWrap = document.createElement('div');
    manageWrap.className = 'mt-opts-profile-section';

    const selectorRow = document.createElement('div');
    selectorRow.className = 'mt-opts-row mt-opts-profile-row';

    const selectInfo = document.createElement('div');
    selectInfo.className = 'mt-opts-row-info';
    selectInfo.innerHTML = `
      <div class="mt-opts-row-title">Perfil Activo</div>
      <div class="mt-opts-row-desc">Selecciona o administra perfiles independientes para cada situacion de juego.</div>
    `;

    const selectCtrl = document.createElement('div');
    selectCtrl.className = 'mt-opts-profile-controls';

    const selectEl = document.createElement('select');
    selectEl.className = 'mt-opts-select';
    for (const name of Object.keys(profiles)) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === activeProfile) opt.selected = true;
      selectEl.appendChild(opt);
    }

    selectEl.addEventListener('change', () => {
      const chosen = selectEl.value;
      if (profiles[chosen]) {
        setActiveProfileName(chosen, storage);
        this.deps.onSettingsChanged({ ...profiles[chosen] });
        this.renderActiveContent();
      }
    });

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'mt-opts-btn';
    newBtn.textContent = 'Guardar Como...';
    newBtn.addEventListener('click', () => {
      const defaultNewName = `Perfil ${Object.keys(profiles).length + 1}`;
      const name =
        typeof window !== 'undefined' && window.prompt
          ? window.prompt('Nombre del nuevo perfil:', defaultNewName)
          : defaultNewName;
      if (name && name.trim()) {
        const trimmed = name.trim();
        profiles[trimmed] = { ...this.s };
        saveProfiles(profiles, storage);
        setActiveProfileName(trimmed, storage);
        this.renderActiveContent();
      }
    });

    const dupBtn = document.createElement('button');
    dupBtn.type = 'button';
    dupBtn.className = 'mt-opts-btn';
    dupBtn.textContent = 'Duplicar';
    dupBtn.addEventListener('click', () => {
      const dupName = `${activeProfile} (Copia)`;
      profiles[dupName] = { ...this.s };
      saveProfiles(profiles, storage);
      setActiveProfileName(dupName, storage);
      this.renderActiveContent();
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'mt-opts-btn mt-opts-btn-danger';
    delBtn.textContent = 'Eliminar';
    if (activeProfile === 'Default') {
      delBtn.disabled = true;
      delBtn.title = 'No se puede eliminar el perfil Default';
    }
    delBtn.addEventListener('click', () => {
      if (activeProfile === 'Default') return;
      delete profiles[activeProfile];
      saveProfiles(profiles, storage);
      setActiveProfileName('Default', storage);
      if (profiles.Default) {
        this.deps.onSettingsChanged({ ...profiles.Default });
      }
      this.renderActiveContent();
    });

    selectCtrl.appendChild(selectEl);
    selectCtrl.appendChild(newBtn);
    selectCtrl.appendChild(dupBtn);
    selectCtrl.appendChild(delBtn);

    selectorRow.appendChild(selectInfo);
    selectorRow.appendChild(selectCtrl);
    manageWrap.appendChild(selectorRow);
    groupManage.appendChild(manageWrap);
    this.contentEl!.appendChild(groupManage);

    // Group 2: Exportar Perfil Actual
    const groupExport = this.createGroup('Exportar Perfil Actual');
    const exportWrap = document.createElement('div');
    exportWrap.className = 'mt-opts-profile-section';

    const exportDesc = document.createElement('div');
    exportDesc.className = 'mt-opts-row-desc';
    exportDesc.textContent =
      'Cadena codificada de tu configuracion actual. Copiala para compartirla o guardarla de respaldo.';

    const exportTextarea = document.createElement('textarea');
    exportTextarea.className = 'mt-opts-textarea';
    exportTextarea.readOnly = true;
    exportTextarea.value = exportProfileString(this.s);

    const exportActions = document.createElement('div');
    exportActions.className = 'mt-opts-profile-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'mt-opts-btn mt-opts-btn-primary';
    copyBtn.textContent = 'Copiar Cadena de Perfil';

    const copyFeedback = document.createElement('span');
    copyFeedback.className = 'mt-opts-feedback';
    copyFeedback.style.display = 'none';

    copyBtn.addEventListener('click', () => {
      const text = exportTextarea.value;
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      exportTextarea.select();
      copyFeedback.textContent = 'Copiado al portapapeles!';
      copyFeedback.style.display = 'inline-block';
      setTimeout(() => {
        copyFeedback.style.display = 'none';
      }, 2500);
    });

    exportActions.appendChild(copyBtn);
    exportActions.appendChild(copyFeedback);

    exportWrap.appendChild(exportDesc);
    exportWrap.appendChild(exportTextarea);
    exportWrap.appendChild(exportActions);
    groupExport.appendChild(exportWrap);
    this.contentEl!.appendChild(groupExport);

    // Group 3: Importar Perfil
    const groupImport = this.createGroup('Importar Perfil');
    const importWrap = document.createElement('div');
    importWrap.className = 'mt-opts-profile-section';

    const importDesc = document.createElement('div');
    importDesc.className = 'mt-opts-row-desc';
    importDesc.textContent =
      'Pega aqui una cadena de perfil (!WoC-Details:... o JSON) para aplicar y guardar la configuracion.';

    const importTextarea = document.createElement('textarea');
    importTextarea.className = 'mt-opts-textarea mt-opts-import-input';
    importTextarea.placeholder = 'Pega la cadena de perfil aqui (!WoC-Details:...)';

    const importRow = document.createElement('div');
    importRow.className = 'mt-opts-profile-actions';

    const importNameInput = document.createElement('input');
    importNameInput.type = 'text';
    importNameInput.className = 'mt-opts-text-input';
    importNameInput.placeholder = 'Nombre para guardar (opcional)';

    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'mt-opts-btn mt-opts-btn-primary mt-opts-btn-import';
    importBtn.textContent = 'Importar y Aplicar';

    const importFeedback = document.createElement('span');
    importFeedback.className = 'mt-opts-feedback';
    importFeedback.style.display = 'none';

    importBtn.addEventListener('click', () => {
      const raw = importTextarea.value.trim();
      if (!raw) {
        importFeedback.textContent = 'Por favor, pega una cadena de perfil.';
        importFeedback.className = 'mt-opts-feedback mt-opts-feedback-err';
        importFeedback.style.display = 'inline-block';
        return;
      }
      const imported = importProfileString(raw);
      if (!imported) {
        importFeedback.textContent = 'Error: Cadena de perfil no valida o corrupta.';
        importFeedback.className = 'mt-opts-feedback mt-opts-feedback-err';
        importFeedback.style.display = 'inline-block';
        return;
      }

      this.update(imported);

      const targetName =
        importNameInput.value.trim() ||
        `Importado (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
      profiles[targetName] = { ...imported };
      saveProfiles(profiles, storage);
      setActiveProfileName(targetName, storage);

      importFeedback.textContent = `Perfil "${targetName}" importado con exito!`;
      importFeedback.className = 'mt-opts-feedback mt-opts-feedback-ok';
      importFeedback.style.display = 'inline-block';

      setTimeout(() => {
        this.renderActiveContent();
      }, 1000);
    });

    importRow.appendChild(importNameInput);
    importRow.appendChild(importBtn);
    importRow.appendChild(importFeedback);

    importWrap.appendChild(importDesc);
    importWrap.appendChild(importTextarea);
    importWrap.appendChild(importRow);
    groupImport.appendChild(importWrap);
    this.contentEl!.appendChild(groupImport);
  }

  // --- UI Component Builders ---

  private createGroup(title: string): HTMLElement {
    const g = document.createElement('div');
    g.className = 'mt-opts-group';
    const h = document.createElement('h3');
    h.className = 'mt-opts-group-title';
    h.textContent = title;
    g.appendChild(h);
    return g;
  }

  private createToggleRow(
    title: string,
    desc: string,
    checked: boolean,
    onChange: (val: boolean) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'mt-opts-row';

    const info = document.createElement('div');
    info.className = 'mt-opts-row-info';
    info.innerHTML = `
      <div class="mt-opts-row-title">${title}</div>
      <div class="mt-opts-row-desc">${desc}</div>
    `;

    const label = document.createElement('label');
    label.className = 'mt-opts-switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => {
      onChange(input.checked);
    });

    const slider = document.createElement('span');
    slider.className = 'mt-opts-switch-slider';

    label.appendChild(input);
    label.appendChild(slider);

    row.appendChild(info);
    row.appendChild(label);
    return row;
  }

  private createSliderRow(
    title: string,
    desc: string,
    min: number,
    max: number,
    step: number,
    value: number,
    unit: string,
    onChange: (val: number) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'mt-opts-row';

    const info = document.createElement('div');
    info.className = 'mt-opts-row-info';
    info.innerHTML = `
      <div class="mt-opts-row-title">${title}</div>
      <div class="mt-opts-row-desc">${desc}</div>
    `;

    const ctrl = document.createElement('div');
    ctrl.className = 'mt-opts-slider-wrap';

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'mt-opts-slider';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);

    const valBadge = document.createElement('span');
    valBadge.className = 'mt-opts-slider-val';
    valBadge.textContent = `${value}${unit}`;

    input.addEventListener('input', () => {
      const v = Number(input.value);
      valBadge.textContent = `${v}${unit}`;
      onChange(v);
    });

    ctrl.appendChild(input);
    ctrl.appendChild(valBadge);

    row.appendChild(info);
    row.appendChild(ctrl);
    return row;
  }

  private createRadioRow(
    title: string,
    desc: string,
    options: { id: string; label: string; desc?: string }[],
    selectedValue: string,
    onChange: (val: string) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'mt-opts-row mt-opts-row-block';

    const info = document.createElement('div');
    info.className = 'mt-opts-row-info';
    info.innerHTML = `
      <div class="mt-opts-row-title">${title}</div>
      <div class="mt-opts-row-desc">${desc}</div>
    `;

    const btnGroup = document.createElement('div');
    btnGroup.className = 'mt-opts-btn-group';

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `mt-opts-choice-btn${selectedValue === opt.id ? ' active' : ''}`;
      btn.innerHTML = `
        <span class="mt-opts-choice-title">${opt.label}</span>
        ${opt.desc ? `<span class="mt-opts-choice-desc">${opt.desc}</span>` : ''}
      `;
      btn.addEventListener('click', () => {
        for (const b of btnGroup.querySelectorAll('.mt-opts-choice-btn')) {
          b.classList.remove('active');
        }
        btn.classList.add('active');
        onChange(opt.id);
      });
      btnGroup.appendChild(btn);
    }

    row.appendChild(info);
    row.appendChild(btnGroup);
    return row;
  }
}
