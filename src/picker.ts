interface ScreenTile {
  canvas: HTMLCanvasElement;
  bounds: { x: number; y: number; width: number; height: number };
  context: CanvasRenderingContext2D | null;
}

export interface PickerState {
  tiles: ScreenTile[];
  cursorColor: string;
}

export interface PickerElements {
  shell: HTMLElement;
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

  picker.label.textContent = '正在捕获屏幕...';

  try {
    const screenInfos = await window.hiddenPage.getScreenSources();
    if (screenInfos.length === 0) {
      throw new Error('No screen sources found');
    }

    // Calculate the global offset (top-left of the bounding rect of all displays)
    let originX = Infinity;
    let originY = Infinity;
    for (const info of screenInfos) {
      originX = Math.min(originX, info.bounds.x);
      originY = Math.min(originY, info.bounds.y);
    }

    const tiles: ScreenTile[] = [];

    for (const info of screenInfos) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: info.sourceId,
          },
        } as any,
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      await new Promise<void>((resolve) => {
        video.addEventListener('loadeddata', () => resolve(), { once: true });
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0);
      }

      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;

      // Position canvas at display bounds relative to global origin
      canvas.style.position = 'absolute';
      canvas.style.left = `${info.bounds.x - originX}px`;
      canvas.style.top = `${info.bounds.y - originY}px`;
      canvas.style.width = `${info.bounds.width}px`;
      canvas.style.height = `${info.bounds.height}px`;
      canvas.style.display = 'block';

      picker.shell.appendChild(canvas);

      tiles.push({
        canvas,
        bounds: info.bounds,
        context: ctx,
      });
    }

    state.tiles = tiles;

    picker.label.textContent = '点击屏幕任意位置取色';

    await window.hiddenPage.showScreenColorPickerWindow();
  } catch (error) {
    console.error('Failed to capture screen:', error);
    picker.label.textContent = '无法捕获屏幕图像';
    return;
  }

  function findTile(clientX: number, clientY: number): { tile: ScreenTile; localX: number; localY: number } | null {
    for (const tile of state.tiles) {
      const { x, y, width, height } = tile.bounds;
      if (clientX >= x && clientX < x + width && clientY >= y && clientY < y + height) {
        const scaleX = (tile.canvas.width || 1) / width;
        const scaleY = (tile.canvas.height || 1) / height;
        return {
          tile,
          localX: Math.floor((clientX - x) * scaleX),
          localY: Math.floor((clientY - y) * scaleY),
        };
      }
    }
    return null;
  }

  function sampleColorAt(clientX: number, clientY: number): string | null {
    const found = findTile(clientX, clientY);
    if (!found || !found.tile.context) {
      return null;
    }

    try {
      const [r, g, b] = found.tile.context.getImageData(found.localX, found.localY, 1, 1).data;
      return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    } catch {
      return null;
    }
  }

  // Compute origin for converting screen coords to window-local coords
  const originX = state.tiles.reduce((min, t) => Math.min(min, t.bounds.x), Infinity);
  const originY = state.tiles.reduce((min, t) => Math.min(min, t.bounds.y), Infinity);

  window.addEventListener('mousemove', (event) => {
    // Crosshair uses window-local coords (relative to viewport)
    picker.crosshair.style.left = `${event.screenX - originX}px`;
    picker.crosshair.style.top = `${event.screenY - originY}px`;

    const hex = sampleColorAt(event.screenX, event.screenY);
    if (hex) {
      state.cursorColor = hex;
      picker.color.textContent = hex.toUpperCase();
    }
  });

  window.addEventListener('click', async (event) => {
    const hex = sampleColorAt(event.screenX, event.screenY);
    if (hex) {
      await window.hiddenPage.completeScreenColorPick(hex);
    } else {
      await cancelPicker();
    }
  });

  window.addEventListener('contextmenu', async (event) => {
    event.preventDefault();
    await cancelPicker();
  });
}
