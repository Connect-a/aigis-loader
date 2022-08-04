<script setup lang="ts">
import { ALAR, ALIG, ALText, ALTX, parseAL } from './aigis-fuel/AL';

const showImage = async (al: ALTX | ALIG, name: string) => {
  const d = document.getElementById('d');

  const binary = new Uint8ClampedArray(al.Image);
  if (!binary) return;
  if (binary.byteLength === 0) return;
  //
  const sp = document.createElement('span');
  sp.innerText = name;
  sp.style.textAlign = 'left';
  d?.appendChild(sp);
  //
  const image = new ImageData(binary, al.Width, al.Height);
  const c = document.createElement('canvas');
  c.width = image.width;
  c.height = image.height;
  c.getContext('2d')?.putImageData(image, 0, 0);
  d?.appendChild(c);
};

const showText = async (text: string, name: string) => {
  const d = document.getElementById('d');
  //
  const sp = document.createElement('span');
  sp.innerText = name;
  sp.style.textAlign = 'left';
  d?.appendChild(sp);
  //
  const p = document.createElement('pre');
  p.style.textAlign = 'left';
  p.style.border = 'solid';
  p.textContent = text;
  d?.appendChild(p);
};

const onFilesInput = async (payload: Event) => {
  const { target } = payload;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.files) return;

  // search file
  for (const file of Array.from(target.files)) {
    console.log(`- ${file.name}`);
    // PNG
    if ((await file.slice(0, 4).text()) === '�PNG') {
      const d = document.getElementById('d');
      //
      const sp = document.createElement('span');
      sp.innerText = `◆png from ${file.name}`;
      sp.style.textAlign = 'left';
      d?.appendChild(sp);
      //
      const c = document.createElement('canvas');
      const bitmap = await createImageBitmap(file);
      c.width = bitmap.width;
      c.height = bitmap.height;
      c.getContext('2d')?.drawImage(bitmap, 0, 0);
      d?.appendChild(c);
      continue;
    }

    //
    const al = await parseAL(file);
    if (al instanceof ALAR) {
      for (const alFile of al.GetFiles()) {
        // if (!alFile.Name.includes("card") && !alFile.Name.includes("Harlem")) continue;
        // if (!alFile.Name.includes("card")) continue;
        // if (!alFile.Name.includes("Harlem")) continue;
        if (alFile.content instanceof ALTX)
          showImage(alFile.content, alFile.name);
        if (alFile.content instanceof ALIG)
          showImage(alFile.content, alFile.name);
        if (alFile.content instanceof ALText)
          showText(alFile.content.Text, alFile.name);
      }
    }
    if (al instanceof ALTX) showImage(al, 'ALTX');
    if (al instanceof ALIG) showImage(al, 'ALTX');
  }
};

const clear = async (_payload: Event) => {
  const d = document.getElementById('d');
  const files = document.getElementById('fileInput');
  const dirs = document.getElementById('dirInput');
  if (d) d.innerHTML = '';
  if (files) (files as HTMLInputElement).value = '';
  if (dirs) (dirs as HTMLInputElement).value = '';
};
</script>

<template>
  <h1>アイギスローダー</h1>
  <div class="controls">
    <button @click="clear">クリア</button>
    <label>
      <span>ファイル</span>
      <input type="file" multiple id="fileInput" @input="onFilesInput"
    /></label>
    <label>
      <span>フォルダ</span>
      <input type="file" webkitdirectory id="dirInput" @input="onFilesInput"
    /></label>
  </div>
  <div id="d" style="display: grid"></div>
</template>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}

.controls {
  padding: 10px;
  display: grid;
  column-gap: 1em;
  row-gap: 1em;
}
</style>
