import { defineConfig, loadEnv } from "vite";

export default defineConfig(({mode}) => {
 const env=loadEnv(mode,process.cwd(),'VITE_');
 return {
 plugins:[{name:'platform-public-config',buildStart(){
  const missing=['VITE_PLATFORM_URL','VITE_PLATFORM_ANON','VITE_TURNSTILE_KEY'].filter(k=>!(process.env[k]||env[k])?.trim());
  if(missing.length)throw new Error('Platform browser configuration missing: '+missing.join(', '));
 }}],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 4180,
  },
};
});
