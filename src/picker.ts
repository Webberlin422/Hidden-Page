type ColorField = 'fontColor' | 'backgroundColor';

export type PickerState = {
  displayId: string;
  field: ColorField;
  image: HTMLImageElement | null;
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
  magnifierCanvas: HTMLCanvasElement | null;
  magnifierContext: CanvasRenderingContext2D | null;
  imageWidth: number;
  imageHeight: number;
  cursorX: number;
  cursorY: number;
  cursorColor: string;
};

export type PickerElements = {
  image: HTMLImageElement;
  crosshairHorizontal: HTMLElement;
  crosshairVertical: HTMLElement;
  reticle: HTMLElement;
  magnifier: HTMLElement;
  magnifierCanvas: HTMLCanvasElement;
  magnifierColor: HTMLElement;
  label: HTMLElement;
  hex: HTMLElement;
  cancelButton: HTMLButtonElement;
};

export async function bootstrapPicker(picker: PickerElements, pickerState: PickerState): Promise<void> {
  const cancelPicker = async (): Promise<void> => {
    await window.hiddenPage.completeScreenColorPick(null);
  };

  picker.image.addEventListener('contextmenu', async (event) => {
    event.preventDefault();
    await cancelPicker();
  });

  picker.cancelButton.addEventListener('click', async () => {
    await cancelPicker();
  });

  window.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      await cancelPicker();
    }
  });

  picker.label.textContent = pickerState.field === 'fontColor' ? '点击屏幕任意位置取字体颜色' : '点击屏幕任意位置取背景颜色';
  picker.hex.textContent = '正在准备屏幕图像...';
  picker.image.classList.add('picker-shell__image--loading');

  try {
    const capture = await window.hiddenPage.captureDisplayThumbnail(pickerState.displayId);
    const image = new Image();
    image.src = capture.dataUrl;
    await image.decode();

    pickerState.image = image;
    pickerState.imageWidth = capture.width;
    pickerState.imageHeight = capture.height;
    pickerState.canvas = document.createElement('canvas');
    pickerState.canvas.width = Math.max(1, image.naturalWidth);
    pickerState.canvas.height = Math.max(1, image.naturalHeight);
    pickerState.context = pickerState.canvas.getContext('2d', { willReadFrequently: true });
    pickerState.magnifierCanvas = picker.magnifierCanvas;
    pickerState.magnifierContext = picker.magnifierCanvas.getContext('2d', { willReadFrequently: true });

    if (!pickerState.context || !pickerState.magnifierContext || !pickerState.magnifierCanvas) {
      throw new Error('Unable to create 2D context');
    }

    pickerState.context.imageSmoothingEnabled = false;
    pickerState.context.clearRect(0, 0, pickerState.canvas.width, pickerState.canvas.height);
    pickerState.context.drawImage(image, 0, 0);

    picker.image.src = capture.dataUrl;
    picker.image.classList.remove('picker-shell__image--loading');
    picker.hex.textContent = '单击选择颜色，Esc 或右键取消';
    renderPickerMagnifier(0, 0);

    await window.hiddenPage.showScreenColorPickerWindow();
  } catch (error) {
    console.error('Failed to prepare screen picker:', error);
    picker.hex.textContent = '无法获取屏幕图像';
    return;
  }

  function renderPickerMagnifier(offsetX: number, offsetY: number): void {
    if (!pickerState.image || !pickerState.magnifierCanvas || !pickerState.magnifierContext) {
      return;
    }

    const image = pickerState.image;
    const canvas = pickerState.magnifierCanvas;
    const context = pickerState.magnifierContext;
    const sourceSize = 26;
    const rect = picker.image.getBoundingClientRect();
    const scaleX = image.naturalWidth / rect.width;
    const scaleY = image.naturalHeight / rect.height;
    const imageX = Math.max(0, Math.min(image.naturalWidth - sourceSize, Math.floor(offsetX * scaleX - sourceSize / 2)));
    const imageY = Math.max(0, Math.min(image.naturalHeight - sourceSize, Math.floor(offsetY * scaleY - sourceSize / 2)));

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(image, imageX, imageY, sourceSize, sourceSize, 0, 0, canvas.width, canvas.height);

    const magnifier = picker.magnifier;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const magnifierWidth = 220;
    const magnifierHeight = 220;
    let left = offsetX + 28;
    let top = offsetY + 28;

    if (left + magnifierWidth > windowWidth) {
      left = offsetX - magnifierWidth - 28;
    }
    if (top + magnifierHeight > windowHeight) {
      top = offsetY - magnifierHeight - 28;
    }

    left = Math.min(windowWidth - magnifierWidth - 12, Math.max(12, left));
    top = Math.min(windowHeight - magnifierHeight - 12, Math.max(12, top));

    magnifier.style.transform = `translate(${left}px, ${top}px)`;
    magnifier.style.setProperty('--magnifier-color', pickerState.cursorColor);
  }

  async function updatePointer(event: PointerEvent | MouseEvent): Promise<void> {
    if (
      !pickerState.image ||
      !pickerState.canvas ||
      !pickerState.context ||
      !pickerState.magnifierCanvas ||
      !pickerState.magnifierContext
    ) {
      return;
    }

    const rect = picker.image.getBoundingClientRect();
    const offsetX = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
    const offsetY = Math.min(rect.height, Math.max(0, event.clientY - rect.top));
    pickerState.cursorX = offsetX;
    pickerState.cursorY = offsetY;
    picker.crosshairHorizontal.style.top = `${Math.round(offsetY)}px`;
    picker.crosshairVertical.style.left = `${Math.round(offsetX)}px`;
    picker.reticle.style.left = `${Math.round(offsetX - 14)}px`;
    picker.reticle.style.top = `${Math.round(offsetY - 14)}px`;

    const sampleX = Math.min(
      Math.max(0, Math.floor((offsetX / Math.max(1, rect.width)) * Math.max(1, pickerState.imageWidth))),
      Math.max(0, pickerState.imageWidth - 1),
    );
    const sampleY = Math.min(
      Math.max(0, Math.floor((offsetY / Math.max(1, rect.height)) * Math.max(1, pickerState.imageHeight))),
      Math.max(0, pickerState.imageHeight - 1),
    );

    try {
      const sampled = await window.hiddenPage.samplePixelColor(sampleX, sampleY);
      if (sampled.hex) {
        pickerState.cursorColor = sampled.hex;
        picker.hex.textContent = sampled.hex.toUpperCase();
        picker.magnifierColor.textContent = sampled.hex.toUpperCase();
      }
    } catch (error) {
      console.error('Failed to sample pixel color:', error);
    }

    renderPickerMagnifier(offsetX, offsetY);
  }

  picker.image.addEventListener('pointermove', (event) => {
    void updatePointer(event);
  });

  picker.image.addEventListener('pointerenter', (event) => {
    void updatePointer(event);
  });

  picker.image.addEventListener('click', async (event) => {
    if (!pickerState.image || !pickerState.canvas || !pickerState.context) {
      return;
    }

    const rect = picker.image.getBoundingClientRect();
    const offsetX = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
    const offsetY = Math.min(rect.height, Math.max(0, event.clientY - rect.top));
    const sampleX = Math.min(
      Math.max(0, Math.floor((offsetX / Math.max(1, rect.width)) * Math.max(1, pickerState.imageWidth))),
      Math.max(0, pickerState.imageWidth - 1),
    );
    const sampleY = Math.min(
      Math.max(0, Math.floor((offsetY / Math.max(1, rect.height)) * Math.max(1, pickerState.imageHeight))),
      Math.max(0, pickerState.imageHeight - 1),
    );

    const sampled = await window.hiddenPage.samplePixelColor(sampleX, sampleY);
    if (!sampled.hex) {
      picker.hex.textContent = '未能识别该像素';
      return;
    }

    picker.hex.textContent = sampled.hex.toUpperCase();
    await window.hiddenPage.completeScreenColorPick(sampled.hex);
  });
}
