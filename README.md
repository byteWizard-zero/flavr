# 🍳 Flavr: Smart AI Pantry Chef

[![Deployed on Vercel](https://img.shields.io/badge/Vercel-Deployed-000000?style=for-the-badge&logo=vercel)](https://recipe-finder-lac-one.vercel.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Gemini](https://img.shields.io/badge/Gemini-2.5_Flash-orange?style=for-the-badge&logo=google-gemini)](https://ai.google.dev/)

> "Turn whatever you have in your kitchen into an extraordinary meal. No waste, no stress, just delicious food."

**Flavr** is a modern, high-performance web application designed to help home cooks—especially absolute beginners—create amazing dishes using whatever ingredients they currently have. Powered by **Gemini 2.5 Flash** using structured JSON output, the app evaluates pantry ingredients, checks for culinary safety, ranks recipes by feasibility, and offers detailed step-by-step instructions.

---

## ✨ Features

* **🧠 Smart Pantry Input:** Add custom ingredients or click common suggestions. Features instant autocomplete.
* **⚠️ Redundancy & Duplicate Warnings:** Intelligent string checks detect if you are adding singular/plural duplicates (e.g., "onion" vs "onions") or highly similar items, keeping your pantry list clean.
* **🔬 AI Sanity Check:** Before generating recipes, Gemini performs a validation phase to check if your ingredients can actually make a real, edible dish. It soft-nudges you if you put in junk inputs or incompatible items.
* **📝 Detailed Recipe Cards:** Includes estimated cook time, difficulty levels, cuisine classifications, nutritional summaries (approximate calories and protein), and ingredient matching (clearly showing what you have and what minimal extra items you might need).
* **🔀 Ingredient Substitution Tips:** Out of an ingredient? Gemini provides chef-curated substitution recommendations dynamically based on your recipe.
* **👨‍🍳 Beginner-Friendly Instructions:** Steps include explicit visual and sensory cues (e.g., *"cook until the onions turn translucent and soft, about 5 minutes"*) rather than assuming prior culinary knowledge.

---

## 🛠️ Tech Stack

* **Frontend Framework:** React 19 (Vite)
* **Styling & Theme:** Tailwind CSS
* **Generative Core:** Google Generative AI SDK (`gemini-2.5-flash` model)
* **Deployment Platform:** Vercel

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* A Google Gemini API Key. You can get one from [Google AI Studio](https://aistudio.google.com/).

### Installation

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/byteWizard-zero/recipe-finder.git
   cd recipe-finder
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env.local` file in the root directory and add your API key:
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Start Development Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

5. **Build for Production:**
   ```bash
   npm run build
   ```
