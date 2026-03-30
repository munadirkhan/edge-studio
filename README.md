# EdgeStudio

EdgeStudio is a private AI-powered short-form video creation studio for motivational content.

## What It Does
- Turns a simple idea into a ready-to-post vertical video flow
- Generates cinematic background art with DALL-E 3
- Uses JARVIS to suggest a content direction and posting angle
- Generates hook, caption, and hashtags for TikTok and Reels
- Exports 9:16 video and PNG preview from the browser

## Core Stack
- React + Vite
- OpenAI GPT-4o and GPT-4o-mini
- DALL-E 3 image generation
- HTML5 Canvas, Web Audio API, MediaRecorder
- Serverless API routes in the api folder

## Local Setup
1. Install dependencies:
   npm install
2. Create a .env file with your key:
   VITE_OPENAI_API_KEY=your_key_here
3. Start development:
   npm run dev
4. Build production bundle:
   npm run build

## Current Product Direction
- Brand: EdgeStudio
- AI assistant name: JARVIS
- Content focus: motivational short-form creation
- Output focus: high-retention hooks, captions, and vertical assets

## Project Structure
- src/App.jsx: main workflow and UI
- src/templates.js: visual template definitions
- src/index.css: global styling and component styles
- api/generate-image.js: DALL-E background generation
- api/generate-caption.js: hook/caption/hashtags generation
- api/jarvis-advice.js: JARVIS direction suggestions

## Notes
This repo is intentionally private-first and optimized for fast personal content production.
