export interface PickerState {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
  cursorColor: string;
}

export interface PickerElements {
  canvas: HTMLCanvasElement;
  crosshair: HTMLElement;
  label: HTMLElement;
  color: HTMLElement;
  cancelButton: HTMLButtonElement;
}

export async function bootstrapPicker(picker: PickerElements, state: PickerState): Promise<void> {
  const cancelPicker = async (): Promise<void> => {
    await window.hiddenPage.completeScreenColorPick(null);
  };

  window.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      await cancelPicker();
    }
  });

  picker.cancelButton.addEventListener('click', async () => {
    await cancelPicker();
  });

  picker.canvas.addEventListener('contextmenu', async (event) => {
    event.preventDefault();
    await cancelPicker();
  });

  picker.label.textContent = '正在捕获屏幕...';

  try {
    // Main process captures screen via desktopCapturer thumbnail (NativeImage)
    // Avoids getUserMedia which may only capture same-app content
    const { dataUrl, width, height } = await window.hiddenPage.captureScreen();

    const image = new Image();
    image.src = dataUrl;
    await image.decode();

    const canvas = picker.canvas;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Unable to create 2D context');
    }

    ctx.drawImage(image, 0, 0);

    state.canvas = canvas;
    state.context = ctx;

    picker.label.textContent = '点击屏幕任意位置取色';

    await window.hiddenPage.showScreenColorPickerWindow();
  } catch (error) {
    console.error('Failed to capture screen:', error);
    picker.label.textContent = '无法捕获屏幕图像';
    return;
  }

  function sampleColor(clientX: number, clientY: number): string | null {
    if (!state.canvas || !state.context) {
      return null;
    }

    const rect = state.canvas.getBoundingClientRect();
    const scaleX = state.canvas.width / rect.width;
    const scaleY = state.canvas.height / rect.height;
    const px = Math.floor(clientX * scaleX);
    const py = Math.floor(clientY * scaleY);

    try {
      const [r, g, b] = state.context.getImageData(px, py, 1, 1).data;
      return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    } catch {
      return null;
    }
  }

  // On pointerdown: cover the screen with a transparent shield so
  // the subsequent click event is absorbed by our window, not the app below.
  // Sample color and resolve on pointerup.
  let pendingHex: string | null = null;
  let shield: HTMLDivElement | null = null;

  function ensureShield(): HTMLDivElement {
    if (!shield) {
      shield = document.createElement('div');
      shield.style.cssText = 'position:fixed;inset:0;z-index:9;background:transparent;cursor:default';
      shield.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
      shield.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
      shield.addEventListener('pointerup', (e) => { e.preventDefault(); e.stopPropagation(); });
      shield.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
      picker.canvas.parentElement!.appendChild(shield);
    }
    return shield;
  }

  picker.canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();

    // Right-click → cancel without shield
    if (event.button === 2) {
      return;
    }

    pendingHex = sampleColor(event.clientX, event.clientY);
    picker.canvas.setPointerCapture(event.pointerId);
    ensureShield();
  });

  picker.canvas.addEventListener('pointerup', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (pendingHex) {
      const hex = pendingHex;
      pendingHex = null;
      picker.canvas.releasePointerCapture(event.pointerId);
      await window.hiddenPage.completeScreenColorPick(hex);
    }
  });

  picker.canvas.addEventListener('mousemove', (event) => {
    event.preventDefault();
    event.stopPropagation();

    picker.crosshair.style.left = `${event.clientX}px`;
    picker.crosshair.style.top = `${event.clientY}px`;

    const hex = sampleColor(event.clientX, event.clientY);
    if (hex) {
      state.cursorColor = hex;
      picker.color.textContent = hex.toUpperCase();
    }
  });
}
