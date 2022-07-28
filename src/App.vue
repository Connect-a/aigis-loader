<script setup lang="ts">
// This starter template is using Vue 3 <script setup> SFCs
// Check out https://vuejs.org/api/sfc-script-setup.html#script-setup
import HelloWorld from './components/HelloWorld.vue'
import { ALAR, ALTX, parseAL } from './aigis-fuel/AL';

const c = async (payload: Event) => {
  const { target } = payload;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.files) return;

  const d = document.getElementById("d");

  for (const file of Array.from(target.files)) {
    const al = parseAL(Buffer.from(await file.arrayBuffer()));
    if (!(al instanceof ALAR)) continue;

    for (const alFile of al.Files.filter(f => (f.Content instanceof ALTX))) {
      const image = new ImageData(
        new Uint8ClampedArray(alFile.Content.Image),
        alFile.Content.Width,
        alFile.Content.Height);
      const c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      c.getContext('2d')?.putImageData(image, 0, 0);
      d?.appendChild(c);
    }
  }
}
</script>

<template>
  <img alt="Vue logo" src="./assets/logo.png" />
  <input type="file" name="ar" id="ar" @change="c">
  <div id="d"></div>
  <HelloWorld msg="Hello Vue 3 + TypeScript + Vite" />
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
</style>
