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

  // Track pointer state — pick color on pointerdown, resolve on pointerup,
  // keeping the window alive until the mouse button is released so events
  // don't fall through to the app underneath.
  let pendingHex: string | null = null;
  let pointerId = -1;

  picker.canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();

    pendingHex = sampleColor(event.clientX, event.clientY);
    pointerId = event.pointerId;
    picker.canvas.setPointerCapture(pointerId);
  });

  picker.canvas.addEventListener('pointerup', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (pointerId >= 0) {
      picker.canvas.releasePointerCapture(pointerId);
      pointerId = -1;
    }

    if (pendingHex) {
      const hex = pendingHex;
      pendingHex = null;

      // Cover picker with an opaque layer so the window stays alive and
      // absorbs all remaining events (click, lostpointercapture, etc.)
      // while the color is being resolved.
      const shield = document.createElement('div');
      shield.style.cssText = 'position:fixed;inset:0;z-index:9;background:#000;cursor:default';
      picker.canvas.parentElement!.appendChild(shield);

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
