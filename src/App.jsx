import { useState, useEffect, useRef, useCallback } from 'react';
import { generateRecipesFromPantry } from './geminiService';

const COMMON_INGREDIENTS = [
  "onion", "garlic", "ginger", "tomato", "potato", "carrot", "cabbage", "spinach", 
  "egg", "chicken", "beef", "pork", "shrimp", "fish", "tofu", "milk", "cheese", 
  "butter", "heavy cream", "yogurt", "rice", "pasta", "flour", "bread", "olive oil", 
  "vegetable oil", "salt", "black pepper", "soy sauce", "sugar", "lemon", "lime"
];

const PANTRY_STAPLES = {
  "Proteins 🥩": ["egg", "chicken", "beef", "tofu", "shrimp", "fish"],
  "Vegetables 🥦": ["onion", "garlic", "ginger", "tomato", "potato", "carrot", "spinach"],
  "Dairy & Fats 🧈": ["butter", "milk", "cheese", "yogurt", "heavy cream", "olive oil"],
  "Pantry & Grains 🌾": ["rice", "pasta", "flour", "bread", "sugar", "salt", "black pepper"]
};

export default function App() {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [toastMessage, setToastMessage] = useState('');

  const [recipes, setRecipes] = useState([]);
  const [aiNudge, setAiNudge] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  
  const [selectedRecipe, setSelectedRecipe] = useState(null);

  // Lazy State Initializations
  const [ingredients, setIngredients] = useState(() => {
    const saved = localStorage.getItem('flavr_pantry');
    return saved ? JSON.parse(saved) : [];
  });

  const [dietPreference, setDietPreference] = useState(() => {
    const saved = localStorage.getItem('flavr_diet');
    return saved || 'none';
  });

  const [mealTypePreference, setMealTypePreference] = useState(() => {
    const saved = localStorage.getItem('flavr_meal');
    return saved || 'none';
  });

  const [savedRecipes, setSavedRecipes] = useState(() => {
    const saved = localStorage.getItem('flavr_saved_recipes');
    return saved ? JSON.parse(saved) : [];
  });

  // Drawer and Dialog States
  const [isSavedDrawerOpen, setIsSavedDrawerOpen] = useState(false);
  const [isStaplesOpen, setIsStaplesOpen] = useState(false);
  const [isCookModeOpen, setIsCookModeOpen] = useState(false);
  const [activeCookRecipe, setActiveCookRecipe] = useState(null);
  const [activeCookStep, setActiveCookStep] = useState(0);

  // Timer States
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerMaxSeconds, setTimerMaxSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Text to Speech State
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Refs for timers & audio context
  const toastTimerRef = useRef(null);
  const sizzleSourceRef = useRef(null);
  const audioCtxRef = useRef(null);

  // showToast wrapped in useCallback
  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(''), 4000);
  }, []);

  // playTickSound: A short mechanical click for timer countdowns
  const playTickSound = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.03, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.015);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.02);
    } catch {
      // Ignore audio blocks
    }
  }, []);

  // playTapSound: A soft, organic tap for button interactions
  const playTapSound = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(700, audioCtx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.06);
    } catch {
      // Ignore
    }
  }, []);

  // playAlarmChime: Auditory chime for timer completion
  const playAlarmChime = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      
      const playTone = (freq, duration, startTime) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.18, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration - 0.05);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      
      const now = audioCtx.currentTime;
      playTone(523.25, 0.3, now);       // C5
      playTone(659.25, 0.3, now + 0.12);  // E5
      playTone(783.99, 0.5, now + 0.24);  // G5
    } catch (e) {
      console.warn("Audio Context failed:", e);
    }
    showToast("⏰ Timer complete!");
  }, [showToast]);

  // playBubble: Synthesizes high-pitched cooking/oil bubble pops
  const playBubble = useCallback((audioCtx) => {
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      const pitch = 1400 + Math.random() * 1800;
      osc.frequency.setValueAtTime(pitch, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.045);
      gain.gain.setValueAtTime(0.015, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    } catch {
      // Ignore
    }
  }, []);

  // startSizzling: Synthesizes procedural cooking fry/sizzle white noise loop
  const startSizzling = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;

      // 2 seconds loop buffer of white noise
      const bufferSize = audioCtx.sampleRate * 2;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      // Bandpass filtering makes noise sound like sizzling frying oil
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 4500;
      filter.Q.value = 0.7;

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      source.start();
      sizzleSourceRef.current = source;
      
      // Bubbling pops interval loop
      const bubbleInterval = setInterval(() => {
        if (audioCtx.state === 'closed') {
          clearInterval(bubbleInterval);
          return;
        }
        playBubble(audioCtx);
      }, 160);
      
      source.bubbleInterval = bubbleInterval;
    } catch (e) {
      console.warn("Sizzle failed", e);
    }
  }, [playBubble]);

  // stopSizzling: Tears down audio pipelines safely
  const stopSizzling = useCallback(() => {
    try {
      if (sizzleSourceRef.current) {
        if (sizzleSourceRef.current.bubbleInterval) {
          clearInterval(sizzleSourceRef.current.bubbleInterval);
        }
        sizzleSourceRef.current.stop();
        sizzleSourceRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    } catch (e) {
      console.warn("Stop sizzling failed:", e);
    }
  }, []);

  // Clean up timers & speech on unmount
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      stopSizzling();
    };
  }, [stopSizzling]);

  // Timer Tick Handler
  useEffect(() => {
    let intervalId = null;
    if (isTimerRunning && timerSeconds > 0) {
      intervalId = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            setIsTimerRunning(false);
            playAlarmChime();
            return 0;
          }
          playTickSound();
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isTimerRunning, timerSeconds, playAlarmChime, playTickSound]);

  const savePantryToStorage = (newIngredients) => {
    localStorage.setItem('flavr_pantry', JSON.stringify(newIngredients));
  };

  const checkRedundancy = (newItem, existingItems) => {
    const cleanNew = newItem.trim().toLowerCase();
    const singularNew = cleanNew.endsWith('es') ? cleanNew.slice(0, -2) : (cleanNew.endsWith('s') ? cleanNew.slice(0, -1) : cleanNew);

    for (let item of existingItems) {
      const cleanItem = item.toLowerCase();
      const singularItem = cleanItem.endsWith('es') ? cleanItem.slice(0, -2) : (cleanItem.endsWith('s') ? cleanItem.slice(0, -1) : cleanItem);

      if (cleanNew === cleanItem || singularNew === singularItem) {
        return { type: 'duplicate', message: `"${newItem}" is already in your ingredient list!` };
      }
      if (cleanNew.includes(cleanItem) || cleanItem.includes(cleanNew)) {
        return { type: 'warning', message: `You already have "${item}". Adding "${newItem}" might be redundant.` };
      }
    }
    return null;
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);

    if (value.trim().length > 0) {
      const filtered = COMMON_INGREDIENTS.filter(item => 
        item.toLowerCase().includes(value.toLowerCase()) && !ingredients.includes(item)
      );
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  };

  const addIngredientTag = (itemText) => {
    const cleanItem = itemText.trim().toLowerCase();
    if (!cleanItem) return;

    const redundancyCheck = checkRedundancy(cleanItem, ingredients);
    if (redundancyCheck) {
      showToast(redundancyCheck.message);
      if (redundancyCheck.type === 'duplicate') {
        setInputValue('');
        setSuggestions([]);
        return;
      }
    }

    const updated = [...ingredients, cleanItem];
    setIngredients(updated);
    savePantryToStorage(updated);
    playTapSound();
    setInputValue('');
    setSuggestions([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addIngredientTag(inputValue);
    }
  };

  const removeIngredient = (indexToRemove) => {
    const updated = ingredients.filter((_, index) => index !== indexToRemove);
    setIngredients(updated);
    savePantryToStorage(updated);
    playTapSound();
  };

  const clearPantry = () => {
    setIngredients([]);
    savePantryToStorage([]);
    setRecipes([]);
    setSelectedRecipe(null);
    setAiNudge('');
    setApiError('');
    playTapSound();
    showToast("Pantry reset successfully!");
  };

  const toggleSaveRecipe = (recipe) => {
    playTapSound();
    setSavedRecipes((prev) => {
      const isAlreadySaved = prev.some(r => r.id === recipe.id);
      let updated;
      if (isAlreadySaved) {
        updated = prev.filter(r => r.id !== recipe.id);
        showToast("Recipe removed from favorites!");
      } else {
        updated = [...prev, recipe];
        showToast("Recipe added to favorites!");
      }
      localStorage.setItem('flavr_saved_recipes', JSON.stringify(updated));
      return updated;
    });
  };

  const handleCopyRecipe = () => {
    if (!selectedRecipe) return;

    const formattedText = `
🍳 RECIPE BLUEPRINT: ${selectedRecipe.name.toUpperCase()}
✨ Description: ${selectedRecipe.description}
⏱️ Cook Time: ${selectedRecipe.cookTime} | 🔥 Difficulty: ${selectedRecipe.difficulty}

📊 NUTRITION:
• Calories: ${selectedRecipe.nutritionalHighlights?.calories || 'N/A'}
• Protein: ${selectedRecipe.nutritionalHighlights?.protein || 'N/A'}

✓ MATCHED INGREDIENTS USED:
${selectedRecipe.matchedIngredients?.map(ing => `  - ${ing}`).join('\n')}

${selectedRecipe.missingIngredients?.length > 0 ? `➕ EXTRA MINOR ITEMS NEEDED:\n${selectedRecipe.missingIngredients.map(ing => `  - ${ing}`).join('\n')}\n` : ''}
💡 SUBSTITUTION BLUEPRINT:
${selectedRecipe.substitutionTips?.[0] || 'No substitutions needed.'}

🛠️ STEP-BY-STEP CULINARY EXECUTION:
${selectedRecipe.instructions?.map((step, idx) => `${idx + 1}. ${step.replace(/^\*\*\d+\.\s*.*?\*\*\s*/, '')}`).join('\n\n')}

Generated beautifully via Flavr 🍳
    `.trim();

    navigator.clipboard.writeText(formattedText);
    playTapSound();
    showToast("Recipe blueprint copied to clipboard!");
  };

  const handleFindRecipes = async () => {
    setIsLoading(true);
    startSizzling();
    setApiError('');
    setAiNudge('');
    setSelectedRecipe(null);
    
    try {
      const data = await generateRecipesFromPantry(ingredients, {
        diet: dietPreference,
        mealType: mealTypePreference
      });
      
      if (data.sanityCheck && !data.sanityCheck.isValidCombination) {
        setApiError("Hmm, our chef engine thinks those ingredients are highly unlikely to make a cohesive dish. Try adding a baseline pantry staple!");
        setRecipes([]);
      } else {
        setRecipes(data.recipes || []);
        if (data.recipes && data.recipes.length > 0) {
          setSelectedRecipe(data.recipes[0]);
        }
        if (data.sanityCheck?.nudgeMessage) {
          setAiNudge(data.sanityCheck.nudgeMessage);
        }
      }
    } catch (err) {
      setApiError(err.message || "An unexpected culinary error occurred.");
    } finally {
      setIsLoading(false);
      stopSizzling();
    }
  };

  // Timer parsing logic
  const parseDuration = (stepText) => {
    const match = stepText.match(/\b(\d+)\s*(minutes?|mins?|seconds?|secs?)\b/i);
    if (match) {
      const val = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      if (unit.startsWith('sec')) {
        return val;
      }
      return val * 60; // minutes to seconds
    }
    return 0;
  };

  const resetTimerForStep = (stepText) => {
    setIsTimerRunning(false);
    const secs = parseDuration(stepText);
    if (secs > 0) {
      setTimerSeconds(secs);
      setTimerMaxSeconds(secs);
    } else {
      setTimerSeconds(0);
      setTimerMaxSeconds(0);
    }
  };

  const startTimer = () => {
    playTapSound();
    setIsTimerRunning(true);
  };

  const pauseTimer = () => {
    playTapSound();
    setIsTimerRunning(false);
  };

  const resetTimer = () => {
    playTapSound();
    setIsTimerRunning(false);
    setTimerSeconds(timerMaxSeconds);
  };

  // Text-To-Speech integration
  const speakStep = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/^\*\*\d+\.\s*.*?\*\*\s*/, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } else {
      showToast("Speech synthesis not supported in this browser.");
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const startCookMode = () => {
    if (!selectedRecipe) return;
    playTapSound();
    setActiveCookRecipe(selectedRecipe);
    setActiveCookStep(0);
    setIsCookModeOpen(true);
    resetTimerForStep(selectedRecipe.instructions[0]);
  };

  // Circular timer constants
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = timerMaxSeconds > 0 
    ? circumference - (timerSeconds / timerMaxSeconds) * circumference 
    : circumference;

  return (
    <div className="min-h-screen bg-cream text-charcoal font-sans flex flex-col md:flex-row relative overflow-x-hidden">
      
      {/* TOAST WARNINGS */}
      <div className={`fixed top-5 right-5 bg-charcoal text-cream px-5 py-3.5 rounded-lg shadow-2xl text-xs tracking-wide font-medium border border-orange-burnt/20 z-50 transition-all duration-300 transform ${toastMessage ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0 pointer-events-none'}`}>
        ⚠️ {toastMessage}
      </div>
      
      {/* CONTROL INTERFACE PANEL */}
      <div className="w-full md:w-2/5 p-6 sm:p-8 md:p-12 bg-cream-dark border-b md:border-b-0 md:border-r border-olive/10 flex flex-col justify-between shrink-0 min-h-[45vh] md:min-h-screen">
        <div className="space-y-6 md:space-y-8">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-medium text-charcoal tracking-tight mb-2">
                Flavr
              </h1>
              <p className="text-xs sm:text-sm text-charcoal/70 italic font-serif">
                Flip the kitchen script. Tell us what you have, we'll tell you what to cook.
              </p>
            </div>
            <button
              onClick={() => { playTapSound(); setIsSavedDrawerOpen(true); }}
              className="bg-cream hover:bg-cream-dark border border-olive/20 p-2.5 rounded-lg shadow-sm transition-all hover:border-orange-burnt active:scale-95 flex items-center gap-1.5 text-xs font-semibold shrink-0"
              title="Open Favorite Recipes"
            >
              ⭐️ <span className="hidden sm:inline">Favorites ({savedRecipes.length})</span>
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="block text-xs uppercase tracking-wider font-semibold text-charcoal/60">
                Add Ingredients 
              </label>
              {ingredients.length > 0 && (
                <button 
                  onClick={clearPantry}
                  className="text-xs text-orange-burnt hover:underline font-medium transition-all focus:outline-none"
                >
                  Clear All
                </button>
              )}
            </div>
            
            <div className="relative">
              <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder={isLoading ? "Chef is sizzling..." : "Type ingredient and hit Enter..."}
                className="w-full bg-cream border border-olive/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-orange-burnt focus:ring-1 focus:ring-orange-burnt transition-all font-sans placeholder-charcoal/40 z-10 relative disabled:opacity-50"
              />

              {/* SUGGESTIONS MENU */}
              <ul className={`absolute left-0 right-0 mt-1 bg-cream border border-olive/10 rounded-lg shadow-lg max-h-48 overflow-y-auto z-40 text-sm transition-all duration-200 transform origin-top ${suggestions.length > 0 ? 'opacity-100 scale-y-100 translate-y-0' : 'opacity-0 scale-y-95 -translate-y-2 pointer-events-none'}`}>
                {suggestions.map((suggestion, idx) => (
                  <li 
                    key={idx}
                    onClick={() => !isLoading && addIngredientTag(suggestion)}
                    className="px-4 py-2.5 hover:bg-cream-dark cursor-pointer text-charcoal/80 hover:text-orange-burnt transition-colors first:rounded-t-lg last:rounded-b-lg border-b border-cream-dark last:border-none"
                  >
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pills Container */}
            <div className="flex flex-wrap gap-2 pt-1">
              {ingredients.map((item, index) => (
                <span 
                  key={index}
                  className="inline-flex items-center gap-1.5 bg-olive text-cream text-xs font-medium px-3 py-1.5 rounded-full shadow-sm animate-fade-in"
                >
                  {item}
                  <button 
                    onClick={() => !isLoading && removeIngredient(index)}
                    disabled={isLoading}
                    className="hover:text-orange-burnt transition-colors text-sm font-bold focus:outline-none ml-0.5 disabled:opacity-30"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            {/* PREFERENCES SECTION */}
            <div className="space-y-3 pt-2">
              <label className="block text-xs uppercase tracking-wider font-semibold text-charcoal/60">
                Preferences
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-charcoal/50 uppercase tracking-wider mb-1 font-semibold">Diet</label>
                  <select
                    value={dietPreference}
                    onChange={(e) => {
                      setDietPreference(e.target.value);
                      localStorage.setItem('flavr_diet', e.target.value);
                      playTapSound();
                    }}
                    className="w-full bg-cream border border-olive/20 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-orange-burnt transition-all"
                  >
                    <option value="none">No Restriction</option>
                    <option value="Vegetarian">Vegetarian</option>
                    <option value="Vegan">Vegan</option>
                    <option value="Gluten-Free">Gluten-Free</option>
                    <option value="Dairy-Free">Dairy-Free</option>
                    <option value="Keto">Keto</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-charcoal/50 uppercase tracking-wider mb-1 font-semibold">Meal Type</label>
                  <select
                    value={mealTypePreference}
                    onChange={(e) => {
                      setMealTypePreference(e.target.value);
                      localStorage.setItem('flavr_meal', e.target.value);
                      playTapSound();
                    }}
                    className="w-full bg-cream border border-olive/20 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-orange-burnt transition-all"
                  >
                    <option value="none">Any Meal</option>
                    <option value="Breakfast">Breakfast</option>
                    <option value="Lunch">Lunch</option>
                    <option value="Dinner">Dinner</option>
                    <option value="Snack">Snack</option>
                    <option value="Dessert">Dessert</option>
                  </select>
                </div>
              </div>
            </div>

            {/* STAPLES DRAWER */}
            <div className="border border-olive/10 rounded-xl bg-cream-dark/40 overflow-hidden transition-all duration-300">
              <button
                onClick={() => { playTapSound(); setIsStaplesOpen(!isStaplesOpen); }}
                className="w-full flex justify-between items-center px-4 py-3 text-xs uppercase tracking-wider font-semibold text-charcoal/70 hover:bg-olive/5 transition-colors focus:outline-none"
              >
                <span>Quick-Add Staples 🥬</span>
                <span>{isStaplesOpen ? '▲' : '▼'}</span>
              </button>
              {isStaplesOpen && (
                <div className="p-4 pt-1 space-y-3 max-h-60 overflow-y-auto">
                  {Object.entries(PANTRY_STAPLES).map(([category, items]) => (
                    <div key={category} className="space-y-1">
                      <span className="text-[10px] font-semibold text-charcoal/40 uppercase tracking-wider">{category}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((item) => {
                          const isAlreadyAdded = ingredients.includes(item);
                          return (
                            <button
                              key={item}
                              onClick={() => !isAlreadyAdded && addIngredientTag(item)}
                              disabled={isAlreadyAdded}
                              className={`text-[11px] px-2.5 py-1 rounded-md border transition-all duration-200 cursor-pointer ${isAlreadyAdded ? 'bg-olive/10 border-olive/20 text-olive/50 cursor-not-allowed' : 'bg-cream border-olive/15 hover:border-orange-burnt/60 hover:text-orange-burnt'}`}
                            >
                              + {item}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        <div className="pt-6 md:pt-8">
          <button 
            onClick={handleFindRecipes}
            disabled={ingredients.length === 0 || isLoading}
            className="w-full bg-orange-burnt text-cream py-4 rounded-lg font-serif tracking-wide text-base sm:text-lg hover:bg-orange-burnt/90 transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="animate-spin text-xl">🍳</span> Sizzling & Simmering...
              </>
            ) : "Find Recipes"}
          </button>
        </div>
      </div>

      {/* DYNAMIC RECIPE VIEWPORT CONTAINER */}
      <div className="w-full md:w-3/5 p-6 sm:p-8 md:p-12 flex flex-col justify-between bg-cream min-h-[50vh] md:min-h-screen overflow-y-auto">
        
        <div className="w-full flex-grow flex flex-col">
          {isLoading && (
            <div className="m-auto text-center space-y-4 py-12 animate-pulse">
              <span className="text-4xl sm:text-5xl inline-block animate-bounce">🍳</span>
              <h3 className="font-serif text-lg sm:text-xl font-medium text-charcoal">Frying up some delicious recipes...</h3>
              <p className="text-xs text-charcoal/50">Listen closely, the kitchen is busy!</p>
            </div>
          )}

          {!isLoading && apiError && (
            <div className="m-auto max-w-md w-full text-center space-y-4 p-6 bg-red-50 border border-red-200/40 rounded-xl animate-fade-in">
              <span className="text-3xl">🥣</span>
              <h3 className="font-serif text-lg sm:text-xl font-medium text-red-800">Composition Nudge</h3>
              <p className="text-sm text-red-700/80 leading-relaxed">{apiError}</p>
            </div>
          )}

          {!isLoading && !apiError && recipes.length === 0 && (
            <div className="m-auto max-w-md w-full text-center space-y-4 py-12 animate-fade-in">
              <span className="text-4xl">✨</span>
              <h2 className="font-serif text-2xl sm:text-3xl font-medium text-charcoal">Your culinary canvas awaits</h2>
              <p className="text-xs sm:text-sm text-charcoal/60 leading-relaxed px-4">
                What's in your pantry? Drop your ingredients above to unlock tailored culinary guides.
              </p>
            </div>
          )}

          {/* ACTIVE RECIPES RENDER PIPELINE */}
          {!isLoading && !apiError && recipes.length > 0 && (
            <div className="w-full space-y-8 animate-fade-in">
              
              {/* Curated Selectors Row */}
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 justify-between items-end">
                  <h3 className="text-xs uppercase tracking-wider font-semibold text-charcoal/50">Curated Menus</h3>
                  {aiNudge && <span className="text-xs text-olive italic bg-olive/5 px-2 py-0.5 rounded">💡 {aiNudge}</span>}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                  {recipes.map((recipe) => {
                    const isSelected = selectedRecipe?.id === recipe.id;
                    return (
                      <div 
                        key={recipe.id}
                        onClick={() => { playTapSound(); setSelectedRecipe(recipe); }}
                        className={`p-4 sm:p-5 rounded-xl border transition-all cursor-pointer shadow-sm transform hover:-translate-y-0.5 active:translate-y-0 duration-200 ${isSelected ? 'bg-cream-dark border-orange-burnt ring-1 ring-orange-burnt' : 'bg-cream-dark/40 border-olive/10 hover:border-olive/30'}`}
                      >
                        <span className="text-[10px] font-semibold text-orange-burnt tracking-wide uppercase">{recipe.cuisine}</span>
                        <h4 className="font-serif font-medium text-base sm:text-lg text-charcoal mt-0.5 line-clamp-2 leading-snug">{recipe.name}</h4>
                        
                        <div className="flex gap-3 text-xs text-charcoal/60 mt-4 pt-2 border-t border-charcoal/5">
                          <span>⏱️ {recipe.cookTime}</span>
                          <span>🔥 {recipe.difficulty}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Main Active Selection Card */}
              {selectedRecipe && (
                <div className="bg-cream-dark/60 border border-olive/10 rounded-2xl p-5 sm:p-6 md:p-8 space-y-6 transition-all duration-300 shadow-sm animate-fade-in">
                  
                  {/* Info Header */}
                  <div className="border-b border-olive/10 pb-5 flex justify-between items-start gap-4">
                    <div className="space-y-2">
                      <h2 className="font-serif text-2xl sm:text-3xl font-medium text-charcoal leading-tight">{selectedRecipe.name}</h2>
                      <p className="text-xs sm:text-sm text-charcoal/70 leading-relaxed italic font-sans">{selectedRecipe.description}</p>
                      
                      <div className="flex flex-wrap gap-2 pt-2">
                        <span className="bg-olive/10 text-olive text-xs px-2.5 py-1 rounded-md font-medium">Calories: {selectedRecipe.nutritionalHighlights?.calories || "N/A"}</span>
                        <span className="bg-olive/10 text-olive text-xs px-2.5 py-1 rounded-md font-medium">Protein: {selectedRecipe.nutritionalHighlights?.protein || "N/A"}</span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 shrink-0">
                      {/* FAVORITE BUTTON */}
                      <button 
                        onClick={() => toggleSaveRecipe(selectedRecipe)}
                        title={savedRecipes.some(r => r.id === selectedRecipe.id) ? "Remove from favorites" : "Save to favorites"}
                        className={`bg-cream hover:bg-cream-dark border border-olive/20 p-2.5 rounded-lg shadow-xs transition-all hover:border-orange-burnt active:scale-95 text-sm`}
                      >
                        {savedRecipes.some(r => r.id === selectedRecipe.id) ? '⭐' : '☆'}
                      </button>
                      
                      {/* COPY BUTTON */}
                      <button 
                        onClick={handleCopyRecipe}
                        title="Copy full blueprint to clipboard"
                        className="bg-cream hover:bg-cream-dark border border-olive/20 text-charcoal p-2.5 rounded-lg shadow-xs transition-all hover:border-orange-burnt active:scale-95"
                      >
                        📋
                      </button>
                    </div>
                  </div>

                  {/* Split Inventory Tracker Checkboxes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
                    <div className="space-y-2">
                      <h5 className="text-xs uppercase tracking-wider font-semibold text-charcoal/50">Pantry Matches Used</h5>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedRecipe.matchedIngredients?.map((ing, i) => (
                          <span key={i} className="bg-olive text-cream text-[11px] sm:text-xs px-2.5 py-1 rounded-md font-medium shadow-sm">✓ {ing}</span>
                        ))}
                      </div>
                    </div>
                    
                    {selectedRecipe.missingIngredients?.length > 0 && (
                      <div className="space-y-2">
                        <h5 className="text-xs uppercase tracking-wider font-semibold text-charcoal/50">Extra Minor Items Needed</h5>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedRecipe.missingIngredients.map((ing, i) => (
                            <span key={i} className="bg-orange-burnt/10 text-orange-burnt text-[11px] sm:text-xs px-2.5 py-1 rounded-md font-medium">+. {ing}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Substitutions */}
                  {selectedRecipe.substitutionTips?.length > 0 && (
                    <div className="bg-cream border-l-4 border-orange-burnt p-4 rounded-r-lg text-xs sm:text-sm text-charcoal/80 space-y-1 shadow-xs">
                      <span className="font-semibold text-orange-burnt uppercase tracking-wider text-[10px] block">Substitution Blueprint</span>
                      <p className="italic">{selectedRecipe.substitutionTips[0]}</p>
                    </div>
                  )}

                  {/* Steps Timeline Layout */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h5 className="text-xs uppercase tracking-wider font-semibold text-charcoal/50">Culinary Execution Steps</h5>
                      <button
                        onClick={startCookMode}
                        className="bg-orange-burnt text-cream text-xs px-3.5 py-1.5 rounded-lg font-serif font-semibold hover:bg-orange-burnt/90 transition-all shadow-xs flex items-center gap-1.5"
                      >
                        🧑‍🍳 Start Cooking
                      </button>
                    </div>
                    <ol className="space-y-3">
                      {selectedRecipe.instructions?.map((step, idx) => (
                        <li key={idx} className="flex gap-3 sm:gap-4 items-start text-xs sm:text-sm text-charcoal/90 leading-relaxed bg-cream/60 p-4 rounded-xl border border-olive/5 shadow-xs transition-all duration-200">
                          <span className="bg-charcoal text-cream font-serif text-xs rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center shrink-0 mt-0.5 font-bold shadow-sm">
                            {idx + 1}
                          </span>
                          <p className="pt-0.5">{step.replace(/^\*\*\d+\.\s*.*?\*\*\s*/, '')}</p> 
                        </li>
                      ))}
                    </ol>
                  </div>

                </div>
              )}

            </div>
          )}
        </div>

        {/* ATTRIBUTION FOOTER */}
        <div className="w-full text-center pt-12 pb-2 md:pb-0 border-t border-charcoal/5 mt-auto">
          <p className="font-serif italic text-xs text-charcoal/40 tracking-wide">
            Made by Soumya with 🧠
          </p>
        </div>

      </div>

      {/* SAVED RECIPES DRAWER */}
      <div className={`fixed top-0 right-0 h-full w-full sm:w-[400px] bg-cream shadow-2xl border-l border-olive/10 z-50 transition-all duration-300 transform ${isSavedDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-6 h-full flex flex-col justify-between">
          <div className="flex justify-between items-center border-b border-olive/10 pb-4">
            <h3 className="font-serif text-xl font-medium text-charcoal flex items-center gap-2">
              ⭐️ Favorite Recipes
            </h3>
            <button 
              onClick={() => { playTapSound(); setIsSavedDrawerOpen(false); }}
              className="text-2xl text-charcoal hover:text-orange-burnt transition-colors focus:outline-none"
            >
              ×
            </button>
          </div>
          
          <div className="flex-grow overflow-y-auto py-4 space-y-4">
            {savedRecipes.length === 0 ? (
              <div className="text-center py-12 text-charcoal/40 text-sm">
                <p className="text-3xl mb-2">🔖</p>
                <p>No bookmarked recipes yet.</p>
                <p className="text-xs mt-1">Bookmark recipes to save them here!</p>
              </div>
            ) : (
              savedRecipes.map((recipe) => (
                <div 
                  key={recipe.id}
                  className="p-4 rounded-xl border border-olive/10 bg-cream-dark/50 hover:bg-cream-dark transition-all cursor-pointer relative group"
                >
                  <div onClick={() => {
                    playTapSound();
                    setRecipes([recipe, ...recipes.filter(r => r.id !== recipe.id)]);
                    setSelectedRecipe(recipe);
                    setIsSavedDrawerOpen(false);
                  }}>
                    <span className="text-[10px] font-semibold text-orange-burnt tracking-wide uppercase">{recipe.cuisine}</span>
                    <h4 className="font-serif font-medium text-sm text-charcoal mt-0.5 line-clamp-1">{recipe.name}</h4>
                    <p className="text-xs text-charcoal/50 mt-1 line-clamp-2">{recipe.description}</p>
                    <div className="flex gap-3 text-[10px] text-charcoal/60 mt-2">
                      <span>⏱️ {recipe.cookTime}</span>
                      <span>🔥 {recipe.difficulty}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSaveRecipe(recipe);
                    }}
                    className="absolute top-3 right-3 text-red-500 opacity-60 hover:opacity-100 transition-opacity"
                    title="Remove Bookmark"
                  >
                    🗑️
                  </button>
                </div>
              ))
            )}
          </div>
          
          <div className="border-t border-olive/10 pt-4">
            <button 
              onClick={() => { playTapSound(); setIsSavedDrawerOpen(false); }}
              className="w-full bg-charcoal text-cream py-3 rounded-lg text-sm font-medium hover:bg-charcoal/90 transition-all shadow-md"
            >
              Close Favorites
            </button>
          </div>
        </div>
      </div>

      {/* Backdrop for saved drawer */}
      {isSavedDrawerOpen && (
        <div 
          onClick={() => { playTapSound(); setIsSavedDrawerOpen(false); }}
          className="fixed inset-0 bg-charcoal/40 backdrop-blur-xs z-40 transition-opacity"
        />
      )}

      {/* INTERACTIVE COOKING MODE OVERLAY */}
      {isCookModeOpen && activeCookRecipe && (
        <div className="fixed inset-0 bg-charcoal/90 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 transition-all duration-300">
          <div className="bg-cream w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col justify-between overflow-hidden max-h-[90vh]">
            
            {/* Header */}
            <div className="bg-cream-dark p-5 border-b border-olive/15 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-semibold text-orange-burnt tracking-wide uppercase">Cooking Mode</span>
                <h3 className="font-serif font-semibold text-lg sm:text-xl text-charcoal line-clamp-1">{activeCookRecipe.name}</h3>
              </div>
              <button 
                onClick={() => {
                  playTapSound();
                  pauseTimer();
                  stopSpeaking();
                  setIsCookModeOpen(false);
                }}
                className="text-2xl text-charcoal hover:text-orange-burnt transition-colors focus:outline-none"
              >
                ×
              </button>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-cream-dark h-1.5">
              <div 
                className="bg-orange-burnt h-full transition-all duration-300"
                style={{ width: `${((activeCookStep + 1) / activeCookRecipe.instructions.length) * 100}%` }}
              />
            </div>

            {/* Content Body */}
            <div className="flex-grow p-6 sm:p-8 overflow-y-auto flex flex-col items-center justify-start space-y-6">
              
              {/* Step counter */}
              <span className="bg-charcoal text-cream font-serif text-sm px-3 py-1 rounded-full font-bold">
                Step {activeCookStep + 1} of {activeCookRecipe.instructions.length}
              </span>

              {/* Step Text */}
              <p className="font-serif text-lg sm:text-xl md:text-2xl text-charcoal text-center leading-relaxed font-medium px-4">
                {activeCookRecipe.instructions[activeCookStep].replace(/^\*\*\d+\.\s*.*?\*\*\s*/, '')}
              </p>

              {/* Timer Dashboard (Conditionally rendered) */}
              {timerMaxSeconds > 0 && (
                <div className="flex flex-col items-center gap-4 bg-cream-dark/50 p-6 rounded-2xl border border-olive/10 w-full max-w-sm">
                  <div className="relative flex items-center justify-center">
                    {/* Circular Timer SVG */}
                    <svg className="w-32 h-32 transform -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r={radius}
                        stroke="rgba(95, 111, 82, 0.1)"
                        strokeWidth="6"
                        fill="transparent"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r={radius}
                        stroke="#C85A32"
                        strokeWidth="6"
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-linear"
                      />
                    </svg>
                    
                    {/* Time Counter */}
                    <div className="absolute text-center">
                      <span className="font-mono text-2xl font-bold text-charcoal">
                        {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}
                      </span>
                      <span className="block text-[9px] uppercase tracking-wider font-semibold text-charcoal/50">remaining</span>
                    </div>
                  </div>

                  {/* Timer Controls */}
                  <div className="flex gap-2">
                    <button
                      onClick={isTimerRunning ? pauseTimer : startTimer}
                      className="px-4 py-2 bg-charcoal text-cream rounded-md text-xs font-semibold hover:bg-charcoal/90 transition-all flex items-center gap-1.5"
                    >
                      {isTimerRunning ? '⏸️ Pause' : '▶️ Start'}
                    </button>
                    <button
                      onClick={resetTimer}
                      className="px-4 py-2 border border-olive/20 text-charcoal rounded-md text-xs font-semibold hover:bg-cream-dark transition-all"
                    >
                      🔄 Reset
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Footer Navigation */}
            <div className="bg-cream-dark p-5 border-t border-olive/15 flex justify-between items-center">
              <button
                onClick={() => {
                  stopSpeaking();
                  playTapSound();
                  const prevIdx = activeCookStep - 1;
                  setActiveCookStep(prevIdx);
                  resetTimerForStep(activeCookRecipe.instructions[prevIdx]);
                }}
                disabled={activeCookStep === 0}
                className="px-4 py-2.5 rounded-lg border border-olive/20 text-xs font-semibold hover:bg-cream disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                ◀ Previous
              </button>

              <button
                onClick={() => {
                  playTapSound();
                  if (isSpeaking) {
                    stopSpeaking();
                  } else {
                    speakStep(activeCookRecipe.instructions[activeCookStep]);
                  }
                }}
                className={`p-2.5 rounded-full border transition-all flex items-center justify-center ${isSpeaking ? 'bg-orange-burnt/10 border-orange-burnt text-orange-burnt animate-pulse' : 'bg-cream border-olive/20 hover:border-orange-burnt hover:text-orange-burnt'}`}
                title={isSpeaking ? "Stop speaking" : "Speak step instructions"}
              >
                🔊
              </button>

              <button
                onClick={() => {
                  stopSpeaking();
                  playTapSound();
                  if (activeCookStep === activeCookRecipe.instructions.length - 1) {
                    setIsCookModeOpen(false);
                    showToast("🎉 Congratulations, you finished cooking!");
                  } else {
                    const nextIdx = activeCookStep + 1;
                    setActiveCookStep(nextIdx);
                    resetTimerForStep(activeCookRecipe.instructions[nextIdx]);
                  }
                }}
                className="px-5 py-2.5 bg-orange-burnt text-cream rounded-lg text-xs font-semibold hover:bg-orange-burnt/90 transition-all shadow-sm"
              >
                {activeCookStep === activeCookRecipe.instructions.length - 1 ? 'Finish 🎉' : 'Next Step ▶'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}