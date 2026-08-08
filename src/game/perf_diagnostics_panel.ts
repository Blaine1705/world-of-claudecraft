import type { SceneCensusReport } from '../render/scene_census_core';
import type { PerfSnapshot } from './perf';
import {
  diagnosePerfSnapshot,
  formatPerfDiagnosisMarkdown,
  type PerfDiagnosis,
  type PerfDiagnosisFinding,
} from './perf_diagnosis_core';

const SCAN_MS = 15_000;
const MIN_SCAN_FRAMES = 30;
const DEFAULT_STATUS_COLOR = '#bae6fd';

export function localDiagnosticsCaptureEnabled(search: string, hostname: string): boolean {
  if (new URLSearchParams(search).get('diagnosticsCapture') !== '1') return false;
  const host = hostname.toLowerCase();
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1';
}

export interface PerfDiagnosticsPanelOptions {
  startMeasurement(): void;
  snapshot(): PerfSnapshot;
  runSceneCensus(): SceneCensusReport | null;
}

type ScanState = 'waiting' | 'collecting' | 'complete';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', label);
  node.type = 'button';
  node.style.cssText = [
    'appearance:none',
    'border:1px solid rgba(125,211,252,.45)',
    'border-radius:7px',
    'padding:7px 10px',
    'background:#10243a',
    'color:#e0f2fe',
    'font:600 12px/1.2 system-ui,sans-serif',
    'cursor:pointer',
  ].join(';');
  node.addEventListener('click', onClick);
  return node;
}

function setButtonDisabled(node: HTMLButtonElement, disabled: boolean): void {
  node.disabled = disabled;
  node.setAttribute('aria-disabled', String(disabled));
  node.style.cursor = disabled ? 'not-allowed' : 'pointer';
  node.style.opacity = disabled ? '0.5' : '1';
}

function list(title: string, items: string[]): HTMLElement {
  const wrap = el('div');
  const heading = el('div', title);
  heading.style.cssText = 'margin-top:8px;color:#bae6fd;font-weight:700';
  wrap.appendChild(heading);
  const ul = el('ul');
  ul.style.cssText = 'margin:4px 0 0;padding-left:18px;color:#dbeafe';
  for (const item of items) {
    const li = el('li', item);
    li.style.margin = '3px 0';
    ul.appendChild(li);
  }
  wrap.appendChild(ul);
  return wrap;
}

function severityColor(finding: PerfDiagnosisFinding): string {
  if (finding.severity === 'critical') return '#fb7185';
  if (finding.severity === 'warning') return '#fbbf24';
  return '#7dd3fc';
}

export class PerfDiagnosticsPanel {
  private readonly root = el('section');
  private readonly status = el('div');
  private readonly metrics = el('div');
  private readonly progress = el('div');
  private readonly progressFill = el('div');
  private readonly results = el('div');
  private readonly startButton: HTMLButtonElement;
  private readonly censusButton: HTMLButtonElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly downloadButton: HTMLButtonElement;
  private state: ScanState = 'waiting';
  private ready = false;
  private playable = false;
  private autoStartPending = true;

  private activeElapsedMs = 0;
  private activeSegmentStartedAt: number | null = null;
  private scanInterrupted = false;
  private diagnosis: PerfDiagnosis | null = null;
  private finalSnapshot: PerfSnapshot | null = null;
  private completedAt: string | null = null;
  private readonly onVisibilityChange = (): void => {
    if (this.state !== 'collecting') {
      this.activeSegmentStartedAt = null;
      return;
    }
    const now = performance.now();
    if (document.visibilityState !== 'visible') {
      if (this.activeSegmentStartedAt !== null) {
        this.activeElapsedMs += Math.max(0, now - this.activeSegmentStartedAt);
      }
      this.activeSegmentStartedAt = null;
      this.scanInterrupted = true;
      this.status.textContent =
        'Scan paused while this tab is hidden. It will restart when you return.';
      return;
    }
    if (this.scanInterrupted) {
      this.scanInterrupted = false;
      this.activeElapsedMs = 0;
      this.activeSegmentStartedAt = now;
      this.options.startMeasurement();
      this.startButton.textContent = 'Scanning...';
      setButtonDisabled(this.startButton, true);
      this.progressFill.style.width = '0';
      this.progress.setAttribute('aria-valuenow', '0');
      this.status.style.color = DEFAULT_STATUS_COLOR;
      this.status.textContent =
        'Tab restored. Restarting a clean 15-second active-gameplay capture.';
      return;
    }
    this.activeSegmentStartedAt = now;
  };

  constructor(private readonly options: PerfDiagnosticsPanelOptions) {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.root.id = 'woc-diagnostics-panel';
    this.root.setAttribute('aria-label', 'World of ClaudeCraft performance diagnostics');
    this.root.style.cssText = [
      'position:fixed',
      'left:14px',
      'top:14px',
      'z-index:2147483646',
      'width:min(470px,calc(100vw - 28px))',
      'max-height:calc(100vh - 28px)',
      'overflow:auto',
      'box-sizing:border-box',
      'padding:14px',
      'border:1px solid rgba(125,211,252,.42)',
      'border-radius:12px',
      'background:rgba(3,12,24,.94)',
      'color:#e0f2fe',
      'box-shadow:0 18px 70px rgba(0,0,0,.55)',
      'font:12px/1.45 system-ui,-apple-system,Segoe UI,sans-serif',
      'pointer-events:auto',
    ].join(';');

    const header = el('div');
    header.style.cssText = 'display:flex;align-items:flex-start;gap:10px';
    const titleWrap = el('div');
    titleWrap.style.flex = '1';
    const title = el('h2', 'ClaudeCraft Performance Doctor');
    title.style.cssText = 'margin:0;color:#f8fafc;font:700 17px/1.2 system-ui,sans-serif';
    const subtitle = el('div', 'A game-specific scan with evidence and code-level fixes.');
    subtitle.style.cssText = 'margin-top:3px;color:#93c5fd';
    titleWrap.append(title, subtitle);
    const collapse = button('Minimize', () => {
      const collapsed = collapse.getAttribute('aria-expanded') === 'true';
      for (const child of Array.from(this.root.children).slice(1)) {
        (child as HTMLElement).hidden = collapsed;
      }
      collapse.textContent = collapsed ? 'Expand' : 'Minimize';
      collapse.setAttribute('aria-expanded', String(!collapsed));
    });
    collapse.setAttribute('aria-controls', 'woc-diagnostics-panel');
    collapse.setAttribute('aria-expanded', 'true');
    collapse.style.padding = '5px 8px';
    header.append(titleWrap, collapse);
    this.root.appendChild(header);

    this.status.style.cssText = [
      'margin-top:12px',
      'padding:8px 10px',
      'border-radius:8px',
      'background:#0b1f33',
      'color:#bae6fd',
      'font-weight:650',
    ].join(';');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.root.appendChild(this.status);

    this.metrics.style.cssText = [
      'margin-top:8px',
      'padding:8px 10px',
      'border:1px solid rgba(148,163,184,.18)',
      'border-radius:8px',
      'background:rgba(15,23,42,.72)',
      'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'white-space:pre-wrap',
      'color:#cbd5e1',
    ].join(';');
    this.metrics.setAttribute('aria-label', 'Live performance measurements');
    this.root.appendChild(this.metrics);

    this.progress.style.cssText = [
      'height:5px',
      'margin-top:10px',
      'overflow:hidden',
      'border-radius:999px',
      'background:#172554',
    ].join(';');
    this.progressFill.style.cssText =
      'width:0;height:100%;background:#38bdf8;transition:width .25s';
    this.progress.appendChild(this.progressFill);
    this.progress.setAttribute('role', 'progressbar');
    this.progress.setAttribute('aria-label', 'Diagnostic scan progress');
    this.progress.setAttribute('aria-valuemin', '0');
    this.progress.setAttribute('aria-valuemax', '100');
    this.progress.setAttribute('aria-valuenow', '0');
    this.root.appendChild(this.progress);

    const controls = el('div');
    controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:7px;margin-top:10px';
    this.startButton = button('Start 15-second scan', () => this.start());
    this.censusButton = button('Refresh scene census', () => this.refreshSceneCensus());
    this.copyButton = button('Copy clear report', () => this.copy());
    this.downloadButton = button('Download report', () => this.download());
    setButtonDisabled(this.startButton, true);
    setButtonDisabled(this.censusButton, true);
    setButtonDisabled(this.copyButton, true);
    setButtonDisabled(this.downloadButton, true);
    controls.append(this.startButton, this.censusButton, this.copyButton, this.downloadButton);
    this.root.appendChild(controls);

    const instruction = el(
      'p',
      'For the best signal, enter Play Offline, move through the slow area, rotate the camera, and trigger the effect that stutters while the scan is running.',
    );
    instruction.style.cssText = 'margin:10px 0 0;color:#94a3b8';
    this.root.appendChild(instruction);

    this.results.style.marginTop = '12px';
    this.results.setAttribute('aria-label', 'Ranked diagnostic findings');
    this.root.appendChild(this.results);
    document.body.appendChild(this.root);
    this.renderWaiting();
  }

  setReady(ready: boolean): void {
    this.ready = ready;
    if (!ready) {
      this.playable = false;
      this.autoStartPending = true;
      setButtonDisabled(this.startButton, true);
      this.renderWaiting();
      return;
    }
    setButtonDisabled(this.startButton, !this.playable);
    if (this.state === 'waiting')
      this.status.textContent = 'World loaded. Waiting for the first playable frame.';
  }

  onMonitorReset(): void {
    if (!this.ready) return;
    this.playable = true;
    setButtonDisabled(this.startButton, false);
    if (!this.autoStartPending) return;
    this.autoStartPending = false;
    this.beginCollection();
  }

  update(snapshot: PerfSnapshot): void {
    this.renderMetrics(snapshot);
    if (this.state !== 'collecting') return;
    const now = performance.now();
    const activeMs =
      this.activeElapsedMs +
      (this.activeSegmentStartedAt !== null ? Math.max(0, now - this.activeSegmentStartedAt) : 0);
    const progressPercent = Math.round(Math.min(1, activeMs / SCAN_MS) * 100);
    this.progressFill.style.width = `${progressPercent}%`;
    this.progress.setAttribute('aria-valuenow', String(progressPercent));
    const recent = snapshot.windows.last10s;
    if (snapshot.browser.visibilityState !== 'visible') {
      this.status.textContent =
        'Scan paused while this tab is hidden. Return to the game to continue.';
      return;
    }
    if (activeMs < SCAN_MS) {
      this.status.textContent = `Collecting active gameplay: ${Math.max(0, Math.ceil((SCAN_MS - activeMs) / 1000))} seconds remaining`;
      return;
    }
    if (recent.frames < MIN_SCAN_FRAMES) {
      this.status.textContent = `Waiting for representative gameplay frames: ${recent.frames}/${MIN_SCAN_FRAMES}`;
      return;
    }
    this.options.runSceneCensus();
    this.complete();
  }

  private start(): void {
    if (!this.ready || !this.playable) {
      this.renderWaiting();
      return;
    }
    this.autoStartPending = false;
    this.options.startMeasurement();
    this.beginCollection();
  }

  private beginCollection(): void {
    this.state = 'collecting';
    const now = performance.now();
    this.activeElapsedMs = 0;
    this.activeSegmentStartedAt = document.visibilityState === 'visible' ? now : null;
    this.scanInterrupted = false;
    this.diagnosis = null;
    this.finalSnapshot = null;
    this.completedAt = null;
    this.startButton.textContent = 'Scanning...';
    setButtonDisabled(this.startButton, true);
    setButtonDisabled(this.censusButton, true);
    setButtonDisabled(this.copyButton, true);
    setButtonDisabled(this.downloadButton, true);
    this.results.replaceChildren();
    this.progressFill.style.width = '0';
    this.progress.setAttribute('aria-valuenow', '0');
    this.status.style.color = DEFAULT_STATUS_COLOR;
    this.status.textContent = 'Collecting active gameplay: move through the problem area now.';
  }

  private complete(): void {
    if (!this.ready) return;
    this.state = 'complete';
    this.activeSegmentStartedAt = null;
    this.scanInterrupted = false;
    this.finalSnapshot = this.options.snapshot();
    this.diagnosis = diagnosePerfSnapshot(this.finalSnapshot, location.search, {
      desktopShell: false,
    });
    this.completedAt = new Date().toISOString();
    this.progressFill.style.width = '100%';
    this.progress.setAttribute('aria-valuenow', '100');
    this.startButton.textContent = 'Scan another area';
    setButtonDisabled(this.startButton, false);
    setButtonDisabled(this.censusButton, false);
    setButtonDisabled(this.copyButton, false);
    setButtonDisabled(this.downloadButton, false);
    this.renderDiagnosis(this.diagnosis);
    this.postLocalCapture();
  }

  private refreshSceneCensus(): void {
    if (this.state !== 'complete' || !this.finalSnapshot) return;
    const census = this.options.runSceneCensus();
    if (!census) return;
    this.finalSnapshot = { ...this.finalSnapshot, census };
    this.diagnosis = diagnosePerfSnapshot(this.finalSnapshot, location.search, {
      desktopShell: false,
    });
    this.renderDiagnosis(this.diagnosis);
  }

  private renderWaiting(): void {
    this.state = 'waiting';
    this.activeSegmentStartedAt = null;
    this.scanInterrupted = false;
    this.diagnosis = null;
    this.finalSnapshot = null;
    this.completedAt = null;
    this.startButton.textContent = 'Start 15-second scan';
    setButtonDisabled(this.censusButton, true);
    setButtonDisabled(this.copyButton, true);
    setButtonDisabled(this.downloadButton, true);
    this.status.style.color = DEFAULT_STATUS_COLOR;
    this.status.textContent = this.ready
      ? 'Ready to scan. Press Start and reproduce the slowdown.'
      : 'Waiting for the game world. Choose Play Offline or enter an online character.';
    this.metrics.textContent =
      'renderer: waiting\nscene census: waiting\nhitch attribution: armed on world entry';
    this.results.replaceChildren();
    this.progressFill.style.width = '0';
    this.progress.setAttribute('aria-valuenow', '0');
  }

  private renderMetrics(snapshot: PerfSnapshot): void {
    const renderer = snapshot.renderer;
    const hitches = snapshot.hitches;
    this.metrics.textContent = [
      `recent  ${snapshot.windows.last10s.fps} FPS | p95 ${snapshot.windows.last10s.frameMs.p95} ms | >50 ms ${snapshot.windows.last10s.frameMs.long50}`,
      `render  submit ${renderer?.phaseMs.submit.p95 ?? 0} ms | world ${renderer?.phaseMs.world.p95 ?? 0} ms | entities ${renderer?.phaseMs.entities.p95 ?? 0} ms`,
      `scene   ${renderer?.calls ?? 0} calls | ${(renderer?.triangles ?? 0).toLocaleString('en-US')} tris | ${renderer?.views ?? 0} views`,
      `hitches ${hitches?.hitches ?? 0} | shaders ${hitches?.byCause['shader-compile'] ?? 0} | uploads ${hitches?.byCause['texture-upload'] ?? 0} | views ${hitches?.byCause['view-create'] ?? 0}`,
      `GPU     ${renderer?.glRenderer?.slice(0, 74) ?? 'waiting'}`,
    ].join('\n');
  }

  private renderDiagnosis(diagnosis: PerfDiagnosis): void {
    this.results.replaceChildren();
    const statusColor =
      diagnosis.status === 'critical'
        ? '#fb7185'
        : diagnosis.status === 'needs-attention'
          ? '#fbbf24'
          : '#4ade80';
    this.status.textContent = `${diagnosis.score}/100: ${diagnosis.headline}`;
    this.status.style.color = statusColor;
    const summary = el('p', diagnosis.summary);
    summary.style.cssText = 'margin:0 0 10px;color:#dbeafe';
    this.results.appendChild(summary);

    if (diagnosis.findings.length === 0) {
      const healthy = el(
        'div',
        'No actionable threshold fired. If a short hitch still bothers you, rerun the scan along the exact movement path that triggers it.',
      );
      healthy.style.cssText = 'padding:10px;border-left:3px solid #4ade80;background:#071d18';
      this.results.appendChild(healthy);
      return;
    }

    diagnosis.findings.forEach((finding, index) => {
      const card = el('article');
      const color = severityColor(finding);
      card.style.cssText = [
        'margin:9px 0',
        'padding:10px 11px',
        `border-left:3px solid ${color}`,
        'border-radius:7px',
        'background:rgba(15,23,42,.86)',
      ].join(';');
      const title = el('h3', `${index + 1}. ${finding.title}`);
      title.style.cssText = `margin:0;color:${color};font:700 13px/1.3 system-ui,sans-serif`;
      const confidence = el(
        'div',
        `${finding.severity.toUpperCase()} | ${finding.confidence} confidence`,
      );
      confidence.style.cssText = 'margin-top:3px;color:#94a3b8;font-size:10px;letter-spacing:.04em';
      const cause = el('p', finding.cause);
      cause.style.cssText = 'margin:7px 0;color:#e2e8f0';
      card.append(title, confidence, cause);
      card.appendChild(list('Evidence', finding.evidence));
      card.appendChild(list('Try now', finding.immediateFixes));
      card.appendChild(list('Code fix', finding.codeFixes));
      card.appendChild(list('Relevant source', finding.sourceFiles));
      if (finding.action) {
        const action = el('a', finding.action.label);
        action.href = finding.action.href;
        action.style.cssText = 'display:inline-block;margin-top:8px;color:#7dd3fc;font-weight:700';
        card.appendChild(action);
      }
      this.results.appendChild(card);
    });
  }

  private reportText(): string | null {
    if (!this.diagnosis || !this.finalSnapshot) return null;
    return formatPerfDiagnosisMarkdown(this.diagnosis, this.finalSnapshot, {
      ...(this.completedAt ? { capturedAt: this.completedAt } : {}),
    });
  }

  private postLocalCapture(): void {
    if (!localDiagnosticsCaptureEnabled(location.search, location.hostname)) return;
    const text = this.reportText();
    if (!text) return;
    void fetch('/__diagnostics/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'text/markdown;charset=UTF-8' },
      body: text,
    }).catch(() => {
      // The visible panel remains fully usable if the optional dev collector is unavailable.
    });
  }

  private copy(): void {
    const text = this.reportText();
    if (!text) return;
    const write = navigator.clipboard?.writeText(text);
    if (!write) {
      console.info('World of ClaudeCraft diagnosis:', text);
      this.copyButton.textContent = 'Report logged to console';
      window.setTimeout(() => {
        this.copyButton.textContent = 'Copy clear report';
      }, 1400);
      return;
    }
    void write.then(
      () => {
        this.copyButton.textContent = 'Copied';
        window.setTimeout(() => {
          this.copyButton.textContent = 'Copy clear report';
        }, 1400);
      },
      () => {
        console.info('World of ClaudeCraft diagnosis:', text);
        this.copyButton.textContent = 'Copy blocked: report logged';
        window.setTimeout(() => {
          this.copyButton.textContent = 'Copy clear report';
        }, 1400);
      },
    );
  }

  private download(): void {
    const text = this.reportText();
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    const anchor = el('a');
    anchor.href = url;
    anchor.download = `claudecraft-performance-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
