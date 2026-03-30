# 🎬 DeenStudio - AI-Powered Quranic Verse Video Creator

Transform Islamic teachings into stunning short-form vertical videos with AI-generated visuals, authentic audio recitation, and dynamic captions. Perfect for social media, Islamic education, and spiritual reflection.

## ✨ Features

- **AI Image Generation**: DALL-E 3 creates beautiful, themed visuals for each Quranic verse
- **Authentic Recitation**: Choose from 5 professional Quranic reciters (Mishary Al Afasy, Abu Bakr Al Shatri, Saad Al Ghamdi, Nasser Al Qatami, Hani Ar Rifai)
- **Dynamic Captions**: GPT-4o generates contextual hooks, captions, and hashtags for engagement
- **Habibi AI Assistant**: Get personalized verse suggestions and Islamic insights
- **Video Export**: Real-time progress tracking, MP4 format (5-60 seconds)
- **5 Design Templates**: Night Sky, Desert Dawn, Geometric, Garden, Architecture themes
- **Dark Mode Interface**: Navy + Gold Quranic aesthetic with glass-morphism design

## 🛠️ Tech Stack

### Frontend
- **React 19.2.4** - UI framework with hooks and functional components
- **Vite 8.0.1** - Lightning-fast build tool with HMR
- **Tailwind CSS 4.2.2** - Utility-first styling
- **Custom CSS** - Glass-morphism panels, decorative frames, animated starfield

### AI & APIs
- **OpenAI GPT-4o** - Caption generation, hooks, hashtags
- **OpenAI GPT-4o-mini** - Habibi AI fallback suggestions
- **DALL-E 3** (b64_json format) - Image generation with base64 encoding
- **Quran API** - Verse data and metadata
- **Google Fonts API** - Amiri (Arabic) and Inter typefaces

### Media Processing
- **Web Audio API** - Audio playback and synchronization
- **HTML5 Canvas** - Verse rendering (1080x1920 vertical format, RTL-aware)
- **MediaRecorder API** - WebM to MP4 video export
- **Real-time Progress Tracking** - 90-second export timeout with live % feedback

### Backend
- **Serverless Functions** - `/api/generate-image.js`, `/api/generate-caption.js`
- **Environment Variables** - `.env` for secure API key management

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- OpenAI API key

### Installation

```bash
git clone https://github.com/munadirkhan/DeenStudio.git
cd DeenStudio
npm install
```

### Configuration

Create a `.env` file in the root directory:
```env
VITE_OPENAI_API_KEY=sk-proj-your-openai-key-here
```

⚠️ **Never commit `.env` to version control!** It's already in `.gitignore`.

### Development

```bash
npm run dev
```

Visit `http://localhost:5175` and start creating Quranic videos!

### Build for Production

```bash
npm run build
npm run preview
```

## 📽️ How It Works

### Step 1: Select Surah & Verse
Choose from 114 chapters (Surahs) of the Quran. Pick a specific verse or random selection.

### Step 2: Choose Design Template & Reciter
Select your visual theme (Night Sky, Desert Dawn, etc.) and preferred Quranic reciter.

### Step 3: Generate Content
- AI generates verse-themed image via DALL-E 3
- GPT-4o creates engaging hook and caption
- Web Audio fetches authentic recitation
- Real-time preview updates

### Step 4: Export Video
- Canvas renders verse with image background (RTL-aware Arabic)
- MediaRecorder syncs audio with canvas frames
- Download as MP4 (5-60 seconds)
- Share on TikTok, Instagram Reels, YouTube Shorts

## 🎨 UI Themes

| Theme | Colors | Mood |
|-------|--------|------|
| Night Sky | Deep Navy + Aurora Gold | Spiritual, Cosmic |
| Desert Dawn | Sand + Amber | Warm, Mystical |
| Geometric | Teal + Bronze | Modern, Clean |
| Garden | Green + Gold | Peaceful, Natural |
| Architecture | Slate + Rose gold | Modern, Elegant |

## 🤖 Habibi AI Assistant

Ask Habibi for personalized Islamic insights:
- Verse recommendations based on your interest
- Islamic wisdom and perspective
- Daily reflection suggestions
- Falls back to curated suggestions if API unavailable

## 📊 Performance

- **Dev Build**: <300ms startup with HMR
- **Production Build**: 321.93 KB (optimized)
- **Video Export**: ~5-20 seconds for 5-60s video (depends on system)
- **Image Generation**: 20-30 seconds (DALL-E 3 API latency)

## 🔒 Security

- API keys stored in `.env` (not versioned)
- GitHub push protection prevents accidental secret commits
- Client-side processing for user data privacy
- No external cookies or tracking

## 📦 Project Structure

```
DeenStudio/
├── src/
│   ├── App.jsx              # Main 4-step wizard UI
│   ├── index.css            # Global theme & animations
│   ├── templates.js         # 5 design templates
│   ├── main.jsx             # Entry point
│   └── assets/              # Images & icons
├── api/
│   ├── generate-image.js    # DALL-E 3 integration
│   └── generate-caption.js  # GPT-4o caption generation
├── public/                  # Static assets
├── .env                     # Environment variables (ignored)
├── package.json             # Dependencies
└── vite.config.js           # Vite configuration
```

**Live on GitHub**: [munadirkhan/DeenStudio](https://github.com/munadirkhan/DeenStudio)

## 📄 License

Built with ❤️ for Islamic education and community engagement.

## 🙏 Acknowledgments

- Quran API for verse data
- OpenAI for DALL-E 3 and GPT-4o
- Islamic reciters for authentic audio
- React & Vite communities for amazing tools
