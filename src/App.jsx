import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { generateRecipesFromPantry } from './geminiService';

gsap.registerPlugin(useGSAP);

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

const PANTRY_PRESETS = [
  { id: 'dorm', name: 'Late-Night Dorm', icon: '⚡', items: ['noodles', 'egg', 'soy sauce', 'garlic'] },
  { id: 'breakfast', name: 'Morning Rush', icon: '🍳', items: ['egg', 'bread', 'butter', 'cheese'] },
  { id: 'fitness', name: 'Post-Workout Fuel', icon: '🏋️', items: ['chicken', 'rice', 'spinach', 'olive oil'] },
  { id: 'italian', name: 'Rustic Italian', icon: '🍅', items: ['pasta', 'tomato', 'garlic', 'olive oil'] }
];

const KITCHEN_EQUIPMENT = [
  { id: 'stovetop', label: 'Stovetop (Pan/Pot)', icon: '🍳', desc: 'Standard stovetop, fry pan, skillet, or boiling pot' },
  { id: 'air_fryer', label: 'Air Fryer', icon: '🌬️', desc: 'Convection air fryer, roasting & crispy baskets' },
  { id: 'microwave', label: 'Microwave', icon: '🌀', desc: 'Microwave heating, steaming & mug meals' },
  { id: 'kettle', label: 'Electric Kettle', icon: '⚡', desc: 'Boiling water, steeped noodles, poached eggs, hotel/dorm meals' },
  { id: 'oven', label: 'Oven / Baking', icon: '🔥', desc: 'Baking sheet, casserole dish, roasting pan' },
  { id: 'rice_cooker', label: 'Rice Cooker', icon: '🍚', desc: 'One-pot rice cooker steamed meals & porridges' },
  { id: 'toaster', label: 'Toaster / Press', icon: '🥪', desc: 'Slot toaster or sandwich press / panini grill' },
  { id: 'no_cook', label: 'No-Cook (No Heat)', icon: '🥗', desc: 'No heat required (salads, wraps, cold dips & bowls)' }
];

const getEquipmentIcon = (name = '') => {
  const lower = (name || '').toLowerCase();
  if (lower.includes('kettle')) return '⚡';
  if (lower.includes('air fryer') || lower.includes('airfryer')) return '🌬️';
  if (lower.includes('microwave')) return '🌀';
  if (lower.includes('oven') || lower.includes('bake') || lower.includes('roast')) return '🔥';
  if (lower.includes('rice cooker')) return '🍚';
  if (lower.includes('toast') || lower.includes('press') || lower.includes('panini')) return '🥪';
  if (lower.includes('no-cook') || lower.includes('raw') || lower.includes('salad') || lower.includes('cold')) return '🥗';
  return '🍳';
};

const scaleNutrient = (str, multiplier = 1) => {
  if (!str) return 'N/A';
  if (multiplier === 1) return str;
  return str.replace(/(\d+(?:\.\d+)?)/g, (match) => {
    const val = parseFloat(match);
    return Math.round(val * multiplier);
  });
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

  // Theme State (Dark / Light Mode)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('flavr_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Apply theme class gracefully to html and body
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      document.body.classList.add('dark');
      document.body.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.removeAttribute('data-theme');
      document.body.classList.remove('dark');
      document.body.removeAttribute('data-theme');
    }
    localStorage.setItem('flavr_theme', theme);
  }, [theme]);

  // Sync with OS preference changes if no manual override was set
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      const stored = localStorage.getItem('flavr_theme');
      if (!stored) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

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

  const [selectedEquipment, setSelectedEquipment] = useState(() => {
    try {
      const saved = localStorage.getItem('flavr_equipment');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return ['stovetop'];
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

  // Refs for toast timer
  const toastTimerRef = useRef(null);

  // showToast wrapped in useCallback
  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(''), 4000);
  }, []);

  // Clean up timers & speech on unmount
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Timer Tick Handler without sound effects
  useEffect(() => {
    let intervalId = null;
    if (isTimerRunning && timerSeconds > 0) {
      intervalId = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            setIsTimerRunning(false);
            showToast("⏰ Timer complete!");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isTimerRunning, timerSeconds, showToast]);

  // Industry-Grade Functional States
  const [servingsMultiplier, setServingsMultiplier] = useState(1);
  const [checkedMissing, setCheckedMissing] = useState({});
  const [favoritesSearch, setFavoritesSearch] = useState('');

  // Scoped DOM Refs for GSAP
  const sidebarRef = useRef(null);
  const viewportRef = useRef(null);
  const curatedGridRef = useRef(null);
  const activeCardRef = useRef(null);
  const nudgeCardRef = useRef(null);
  const favoritesDrawerRef = useRef(null);
  const cookModalRef = useRef(null);
  const toastRef = useRef(null);

  // Reset portion multiplier & checklist when active recipe switches
  useEffect(() => {
    setServingsMultiplier(1);
    setCheckedMissing({});
  }, [selectedRecipe?.id]);

  // Filter favorites by search query
  const filteredFavorites = useMemo(() => {
    if (!favoritesSearch.trim()) return savedRecipes;
    const q = favoritesSearch.toLowerCase().trim();
    return savedRecipes.filter(recipe => 
      recipe.name?.toLowerCase().includes(q) ||
      recipe.cuisine?.toLowerCase().includes(q) ||
      recipe.equipment?.toLowerCase().includes(q) ||
      recipe.description?.toLowerCase().includes(q)
    );
  }, [savedRecipes, favoritesSearch]);

  // GSAP Animations
  useGSAP(() => {
    gsap.from('.gsap-hero', {
      y: 18,
      opacity: 0,
      duration: 0.55,
      stagger: 0.08,
      ease: 'power2.out'
    });
  }, { scope: sidebarRef });

  useGSAP(() => {
    if (recipes && recipes.length > 0) {
      gsap.fromTo('.curated-card',
        { y: 22, opacity: 0, scale: 0.97 },
        { y: 0, opacity: 1, scale: 1, duration: 0.45, stagger: 0.08, ease: 'power2.out', clearProps: 'transform' }
      );
    }
  }, { dependencies: [recipes], scope: viewportRef, revertOnUpdate: true });

  useGSAP(() => {
    if (selectedRecipe && activeCardRef.current) {
      gsap.fromTo(activeCardRef.current,
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out', clearProps: 'transform' }
      );
    }
  }, { dependencies: [selectedRecipe?.id], scope: viewportRef, revertOnUpdate: true });

  useGSAP(() => {
    if (apiError && nudgeCardRef.current) {
      const tl = gsap.timeline();
      tl.fromTo(nudgeCardRef.current,
        { scale: 0.88, y: -20, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.5, ease: 'back.out(1.5)' }
      ).fromTo('.chef-emblem',
        { scale: 0.5, rotation: -20 },
        { scale: 1, rotation: 0, duration: 0.45, ease: 'elastic.out(1.2, 0.5)' },
        '-=0.25'
      );
    }
  }, { dependencies: [apiError], scope: viewportRef, revertOnUpdate: true });

  useGSAP(() => {
    if (toastMessage && toastRef.current) {
      gsap.fromTo(toastRef.current,
        { y: -16, opacity: 0, scale: 0.94 },
        { y: 0, opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.5)' }
      );
    }
  }, { dependencies: [toastMessage] });

  useGSAP(() => {
    if (isSavedDrawerOpen && favoritesDrawerRef.current) {
      gsap.fromTo(favoritesDrawerRef.current,
        { x: '100%' },
        { x: '0%', duration: 0.35, ease: 'power3.out' }
      );
    }
  }, { dependencies: [isSavedDrawerOpen] });

  useGSAP(() => {
    if (isCookModeOpen && cookModalRef.current) {
      gsap.fromTo(cookModalRef.current,
        { scale: 0.92, opacity: 0, y: 15 },
        { scale: 1, opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }
      );
    }
  }, { dependencies: [isCookModeOpen] });

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
  };

  const clearPantry = () => {
    setIngredients([]);
    savePantryToStorage([]);
    setRecipes([]);
    setSelectedRecipe(null);
    setAiNudge('');
    setApiError('');
    showToast("Pantry reset successfully!");
  };

  const toggleEquipment = (id) => {
    setSelectedEquipment((prev) => {
      let updated;
      if (prev.includes(id)) {
        if (prev.length === 1) {
          showToast("Please keep at least one kitchen appliance selected!");
          return prev;
        }
        updated = prev.filter(item => item !== id);
      } else {
        updated = [...prev, id];
      }
      localStorage.setItem('flavr_equipment', JSON.stringify(updated));
      return updated;
    });
  };

  const toggleSaveRecipe = (recipe) => {
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

  const applyPreset = (items) => {
    setIngredients(items);
    savePantryToStorage(items);
    showToast(`Loaded ${items.length} items from preset!`);
  };

  const toggleMissingItem = (item) => {
    setCheckedMissing(prev => ({
      ...prev,
      [item]: !prev[item]
    }));
  };

  const copyShoppingList = async () => {
    if (!selectedRecipe?.missingIngredients?.length) return;
    const items = selectedRecipe.missingIngredients.map(item => 
      `${checkedMissing[item] ? '☑' : '☐'} ${item}`
    ).join('\n');
    const text = `🛒 FLAVR SHOPPING LIST (${selectedRecipe.name.toUpperCase()}):\n${items}\n\nPrepared with Flavr 🍳`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showToast("Shopping list copied to clipboard!");
    } catch {
      showToast("Shopping list ready!");
    }
  };

  const handlePrintRecipe = () => {
    window.print();
  };

  const handleCopyRecipe = async () => {
    if (!selectedRecipe) return;

    const scaledCal = scaleNutrient(selectedRecipe.nutritionalHighlights?.calories, servingsMultiplier);
    const scaledPro = scaleNutrient(selectedRecipe.nutritionalHighlights?.protein, servingsMultiplier);

    const formattedText = `
🍳 RECIPE BLUEPRINT: ${selectedRecipe.name.toUpperCase()} (${servingsMultiplier}x Servings)
✨ Description: ${selectedRecipe.description}
⏱️ Cook Time: ${selectedRecipe.cookTime} | 🔥 Difficulty: ${selectedRecipe.difficulty} | 🏷️ Gear: ${selectedRecipe.equipment || 'Standard Cookware'}

📊 NUTRITION (${servingsMultiplier} ${servingsMultiplier === 1 ? 'serving' : 'servings'}):
• Calories: ${scaledCal}
• Protein: ${scaledPro}

✓ MATCHED INGREDIENTS USED:
${selectedRecipe.matchedIngredients?.map(ing => `  - ${ing}`).join('\n')}

${selectedRecipe.missingIngredients?.length > 0 ? `➕ EXTRA MINOR ITEMS NEEDED:\n${selectedRecipe.missingIngredients.map(ing => `  - ${checkedMissing[ing] ? '[✓]' : '[ ]'} ${ing}`).join('\n')}\n` : ''}
💡 SUBSTITUTION BLUEPRINT:
${selectedRecipe.substitutionTips?.[0] || 'No substitutions needed.'}

🛠️ STEP-BY-STEP CULINARY EXECUTION:
${selectedRecipe.instructions?.map((step, idx) => `${idx + 1}. ${step.replace(/^\*\*\d+\.\s*.*?\*\*\s*/, '')}`).join('\n\n')}

Generated beautifully via Flavr 🍳
    `.trim();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(formattedText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = formattedText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showToast("Recipe blueprint copied to clipboard!");
    } catch {
      showToast("Recipe blueprint ready!");
    }
  };

  const handleFindRecipes = async () => {
    setIsLoading(true);
    setApiError('');
    setAiNudge('');
    setSelectedRecipe(null);
    
    try {
      const equipmentLabels = selectedEquipment.map(id => {
        const item = KITCHEN_EQUIPMENT.find(e => e.id === id);
        return item ? item.label : id;
      });

      const data = await generateRecipesFromPantry(ingredients, {
        diet: dietPreference,
        mealType: mealTypePreference,
        equipment: equipmentLabels
      });
      
      if (data.sanityCheck && !data.sanityCheck.isValidCombination) {
        setApiError(
          data.sanityCheck.nudgeMessage || 
          "Our chef inspected those ingredients and halted cooking! Please bring real, edible ingredients to the kitchen."
        );
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
    setIsTimerRunning(true);
  };

  const pauseTimer = () => {
    setIsTimerRunning(false);
  };

  const resetTimer = () => {
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
      
      {/* TOAST NOTIFICATIONS */}
      <div 
        ref={toastRef} 
        className={`fixed top-5 right-5 bg-charcoal text-[#FDFBF7] dark:bg-[#1C201A] dark:text-[#EDE8DE] dark:border dark:border-olive/30 px-5 py-3.5 rounded-lg shadow-2xl text-xs tracking-wide font-medium border border-orange-burnt/20 z-50 transition-opacity duration-300 ${toastMessage ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        ⚠️ {toastMessage}
      </div>
      
      {/* CONTROL INTERFACE PANEL */}
      <div 
        ref={sidebarRef} 
        className="w-full md:w-2/5 p-6 sm:p-8 md:p-12 bg-cream-dark border-b md:border-b-0 md:border-r border-olive/10 flex flex-col justify-between shrink-0 min-h-[45vh] md:min-h-screen no-print"
      >
        <div className="space-y-6 md:space-y-8">
          
          {/* HEADER ROW WITH BRAND & CONTROLS */}
          <div className="flex justify-between items-start gap-3 gsap-hero">
            <div>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-medium text-charcoal tracking-tight mb-2">
                Flavr
              </h1>
              <p className="text-xs sm:text-sm text-charcoal/70 italic font-serif">
                Flip the kitchen script. Tell us what you have, we'll tell you what to cook.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* THEME TOGGLE SWITCH */}
              <button
                onClick={toggleTheme}
                role="switch"
                aria-checked={theme === 'dark'}
                aria-label={theme === 'dark' ? "Switch to light mode" : "Switch to dark mode"}
                title={theme === 'dark' ? "Switch to light mode" : "Switch to dark mode"}
                className="bg-cream hover:bg-cream-dark border border-olive/20 dark:border-olive/30 px-3 py-2.5 rounded-lg shadow-sm transition-all hover:border-orange-burnt active:scale-95 flex items-center gap-2 text-xs font-semibold shrink-0 cursor-pointer group"
              >
                <div className="relative w-4 h-4 flex items-center justify-center">
                  {/* Sun Icon */}
                  <svg 
                    className={`w-4 h-4 text-orange-burnt absolute transition-all duration-300 transform ${
                      theme === 'dark' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50 pointer-events-none'
                    }`}
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  {/* Moon Icon */}
                  <svg 
                    className={`w-4 h-4 text-olive absolute transition-all duration-300 transform ${
                      theme === 'dark' ? 'opacity-0 rotate-90 scale-50 pointer-events-none' : 'opacity-100 rotate-0 scale-100'
                    }`}
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                </div>
                <span className="hidden sm:inline text-charcoal/80 group-hover:text-charcoal transition-colors">
                  {theme === 'dark' ? 'Light' : 'Dark'}
                </span>
              </button>

              {/* FAVORITES BUTTON */}
              <button
                onClick={() => setIsSavedDrawerOpen(true)}
                className="bg-cream hover:bg-cream-dark border border-olive/20 dark:border-olive/30 p-2.5 rounded-lg shadow-sm transition-all hover:border-orange-burnt active:scale-95 flex items-center gap-1.5 text-xs font-semibold shrink-0"
                title="Open Favorite Recipes"
              >
                ⭐️ <span className="hidden sm:inline">Favorites ({savedRecipes.length})</span>
              </button>
            </div>
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
                placeholder={isLoading ? "Generating recipes..." : "Type ingredient and hit Enter..."}
                className="w-full bg-cream border border-olive/20 dark:border-olive/30 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-orange-burnt focus:ring-1 focus:ring-orange-burnt transition-all font-sans placeholder-charcoal/40 z-10 relative disabled:opacity-50"
              />

              {/* SUGGESTIONS MENU */}
              <ul className={`absolute left-0 right-0 mt-1 bg-cream border border-olive/10 dark:border-olive/25 rounded-lg shadow-lg max-h-48 overflow-y-auto z-40 text-sm transition-all duration-200 transform origin-top ${suggestions.length > 0 ? 'opacity-100 scale-y-100 translate-y-0' : 'opacity-0 scale-y-95 -translate-y-2 pointer-events-none'}`}>
                {suggestions.map((suggestion, idx) => (
                  <li 
                    key={idx}
                    onClick={() => !isLoading && addIngredientTag(suggestion)}
                    className="px-4 py-2.5 hover:bg-cream-dark cursor-pointer text-charcoal/80 hover:text-orange-burnt transition-colors first:rounded-t-lg last:rounded-b-lg border-b border-cream-dark dark:border-olive/10 last:border-none"
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
                  className="inline-flex items-center gap-1.5 bg-olive text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-sm animate-fade-in"
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

            {/* PANTRY PRESETS QUICK STARTERS */}
            <div className="pt-1 gsap-hero">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-charcoal/50">
                  Quick Starter Packs
                </span>
                <span className="text-[10px] text-charcoal/40 italic">1-click load</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PANTRY_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.items)}
                    disabled={isLoading}
                    className="text-[11px] px-2.5 py-1 rounded-md border border-olive/20 dark:border-olive/30 bg-cream/70 hover:bg-cream dark:bg-cream-dark/40 hover:border-orange-burnt/60 hover:text-orange-burnt transition-all flex items-center gap-1 cursor-pointer group disabled:opacity-40"
                    title={`Loads: ${preset.items.join(', ')}`}
                  >
                    <span>{preset.icon}</span>
                    <span className="font-medium text-charcoal/80 group-hover:text-orange-burnt">{preset.name}</span>
                  </button>
                ))}
              </div>
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
                    }}
                    className="w-full bg-cream border border-olive/20 dark:border-olive/30 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-orange-burnt transition-all"
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
                    }}
                    className="w-full bg-cream border border-olive/20 dark:border-olive/30 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-orange-burnt transition-all"
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

            {/* KITCHEN APPLIANCES & GEAR SECTION */}
            <div className="space-y-2.5 pt-2">
              <div className="flex justify-between items-center">
                <label className="block text-xs uppercase tracking-wider font-semibold text-charcoal/60">
                  Kitchen Gear & Appliances
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-olive font-semibold bg-olive/10 dark:bg-olive/20 px-2 py-0.5 rounded-full">
                    {selectedEquipment.length} active
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = KITCHEN_EQUIPMENT.map(e => e.id);
                      setSelectedEquipment(allIds);
                      localStorage.setItem('flavr_equipment', JSON.stringify(allIds));
                    }}
                    className="text-[10px] text-charcoal/50 hover:text-orange-burnt transition-colors cursor-pointer"
                    title="Select all appliances"
                  >
                    All
                  </button>
                  <span className="text-[10px] text-charcoal/30">•</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEquipment(['stovetop']);
                      localStorage.setItem('flavr_equipment', JSON.stringify(['stovetop']));
                      showToast("Reset equipment to standard stovetop.");
                    }}
                    className="text-[10px] text-charcoal/50 hover:text-orange-burnt transition-colors cursor-pointer"
                    title="Reset to default stovetop"
                  >
                    Reset
                  </button>
                </div>
              </div>
              
              <p className="text-[11px] text-charcoal/60 italic leading-snug">
                Select what you have available (hotel kettle, air fryer, microwave, etc.):
              </p>

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {KITCHEN_EQUIPMENT.map((equip) => {
                  const isSelected = selectedEquipment.includes(equip.id);
                  return (
                    <button
                      key={equip.id}
                      type="button"
                      onClick={() => toggleEquipment(equip.id)}
                      aria-pressed={isSelected}
                      title={equip.desc}
                      className={`flex items-center justify-between px-2.5 py-2 rounded-lg border text-xs font-medium transition-all duration-150 cursor-pointer text-left ${
                        isSelected 
                          ? 'bg-olive text-white border-olive shadow-xs' 
                          : 'bg-cream border-olive/15 dark:border-olive/25 text-charcoal/75 hover:border-orange-burnt/60 hover:text-charcoal dark:bg-cream-dark/30'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <span>{equip.icon}</span>
                        <span className="truncate">{equip.label.split(' (')[0]}</span>
                      </span>
                      <span className={`text-[10px] ml-1 shrink-0 font-bold ${isSelected ? 'text-white' : 'text-charcoal/30'}`}>
                        {isSelected ? '✓' : '+'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STAPLES DRAWER */}
            <div className="border border-olive/10 dark:border-olive/20 rounded-xl bg-cream-dark/40 overflow-hidden transition-all duration-300">
              <button
                onClick={() => setIsStaplesOpen(!isStaplesOpen)}
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
                              className={`text-[11px] px-2.5 py-1 rounded-md border transition-all duration-200 cursor-pointer ${isAlreadyAdded ? 'bg-olive/10 border-olive/20 text-olive/50 cursor-not-allowed' : 'bg-cream border-olive/15 dark:border-olive/25 hover:border-orange-burnt/60 hover:text-orange-burnt'}`}
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
            className="w-full bg-orange-burnt text-white py-4 rounded-lg font-serif tracking-wide text-base sm:text-lg hover:bg-orange-burnt/90 transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <span className="animate-spin text-xl">🍳</span> Crafting Your Recipes...
              </>
            ) : "Find Recipes"}
          </button>
        </div>
      </div>

      {/* DYNAMIC RECIPE VIEWPORT CONTAINER */}
      <div 
        ref={viewportRef} 
        className="w-full md:w-3/5 p-6 sm:p-8 md:p-12 flex flex-col justify-between bg-cream min-h-[50vh] md:min-h-screen overflow-y-auto"
      >
        
        <div className="w-full flex-grow flex flex-col">
          {isLoading && (
            <div className="m-auto text-center space-y-4 py-12 animate-pulse no-print">
              <span className="text-4xl sm:text-5xl inline-block animate-bounce">🍳</span>
              <h3 className="font-serif text-lg sm:text-xl font-medium text-charcoal">Frying up some delicious recipes...</h3>
              <p className="text-xs text-charcoal/50">Our AI chef is tailoring recipes to your pantry!</p>
            </div>
          )}

          {!isLoading && apiError && (
            <div 
              ref={nudgeCardRef} 
              className="m-auto max-w-lg w-full text-center space-y-4 p-6 sm:p-8 bg-red-50/90 dark:bg-red-950/40 border-2 border-red-300/60 dark:border-red-800/60 rounded-2xl shadow-lg relative overflow-hidden no-print"
            >
              <div className="chef-emblem inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/50 text-3xl shadow-inner mx-auto mb-1">
                👨‍🍳
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-red-600 dark:text-red-400 tracking-widest uppercase bg-red-100 dark:bg-red-900/40 px-3 py-1 rounded-full">
                  Composition Nudge • Chef's Verdict
                </span>
                <h3 className="font-serif text-xl sm:text-2xl font-semibold text-red-900 dark:text-red-200 pt-1">
                  Kitchen Standards Alert
                </h3>
              </div>
              <blockquote className="text-sm sm:text-base text-red-800 dark:text-red-200 font-serif italic leading-relaxed px-2 sm:px-4 border-y border-red-200/60 dark:border-red-800/40 py-3">
                “{apiError}”
              </blockquote>
              <p className="text-xs text-red-700/70 dark:text-red-400/70">
                Adjust your pantry ingredients above to resume culinary creation.
              </p>
            </div>
          )}

          {!isLoading && !apiError && recipes.length === 0 && (
            <div className="m-auto max-w-md w-full text-center space-y-4 py-12 no-print">
              <span className="text-4xl">✨</span>
              <h2 className="font-serif text-2xl sm:text-3xl font-medium text-charcoal">Your culinary canvas awaits</h2>
              <p className="text-xs sm:text-sm text-charcoal/60 leading-relaxed px-4">
                What's in your pantry? Drop your ingredients above to unlock tailored culinary guides.
              </p>
            </div>
          )}

          {/* ACTIVE RECIPES RENDER PIPELINE */}
          {!isLoading && !apiError && recipes.length > 0 && (
            <div className="w-full space-y-8">
              
              {/* Curated Selectors Row */}
              <div className="space-y-3 no-print">
                <div className="flex flex-wrap gap-2 justify-between items-end">
                  <h3 className="text-xs uppercase tracking-wider font-semibold text-charcoal/50">Curated Menus</h3>
                  {aiNudge && <span className="text-xs text-olive italic bg-olive/5 dark:bg-olive/10 px-2 py-0.5 rounded">💡 {aiNudge}</span>}
                </div>
                
                <div ref={curatedGridRef} className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                  {recipes.map((recipe) => {
                    const isSelected = selectedRecipe?.id === recipe.id;
                    return (
                      <div 
                        key={recipe.id}
                        onClick={() => setSelectedRecipe(recipe)}
                        className={`curated-card p-4 sm:p-5 rounded-xl border transition-all cursor-pointer shadow-sm transform hover:-translate-y-0.5 active:translate-y-0 duration-200 ${isSelected ? 'bg-cream-dark border-orange-burnt ring-1 ring-orange-burnt' : 'bg-cream-dark/40 dark:bg-cream-dark/30 border-olive/10 dark:border-olive/20 hover:border-olive/30'}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-semibold text-orange-burnt tracking-wide uppercase">{recipe.cuisine}</span>
                          {recipe.equipment && (
                            <span 
                              className="text-[10px] font-medium bg-olive/10 dark:bg-olive/20 text-olive px-1.5 py-0.5 rounded truncate max-w-[130px]" 
                              title={`Gear: ${recipe.equipment}`}
                            >
                              {getEquipmentIcon(recipe.equipment)} {recipe.equipment}
                            </span>
                          )}
                        </div>
                        <h4 className="font-serif font-medium text-base sm:text-lg text-charcoal mt-1 line-clamp-2 leading-snug">{recipe.name}</h4>
                        
                        <div className="flex gap-3 text-xs text-charcoal/60 mt-4 pt-2 border-t border-charcoal/5 dark:border-charcoal/10">
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
                <div 
                  ref={activeCardRef} 
                  className="recipe-print-area bg-cream-dark/60 dark:bg-cream-dark/40 border border-olive/10 dark:border-olive/20 rounded-2xl p-5 sm:p-6 md:p-8 space-y-6 shadow-sm"
                >
                  
                  {/* Info Header */}
                  <div className="border-b border-olive/10 dark:border-olive/20 pb-5 flex justify-between items-start gap-4">
                    <div className="space-y-2">
                      <h2 className="font-serif text-2xl sm:text-3xl font-medium text-charcoal leading-tight">{selectedRecipe.name}</h2>
                      <p className="text-xs sm:text-sm text-charcoal/70 leading-relaxed italic font-sans">{selectedRecipe.description}</p>
                      
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        {/* SERVINGS MULTIPLIER TOGGLE */}
                        <div className="flex items-center gap-1 bg-cream dark:bg-cream-dark/60 border border-olive/20 dark:border-olive/30 rounded-lg p-0.5 shadow-2xs no-print">
                          <span className="text-[10px] uppercase font-semibold text-charcoal/50 px-1.5">Servings</span>
                          {[1, 2, 4, 6].map((multiplier) => (
                            <button
                              key={multiplier}
                              type="button"
                              onClick={() => setServingsMultiplier(multiplier)}
                              className={`px-2 py-0.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                                servingsMultiplier === multiplier
                                  ? 'bg-orange-burnt text-white shadow-xs'
                                  : 'text-charcoal/60 hover:text-charcoal hover:bg-olive/10'
                              }`}
                            >
                              {multiplier}x
                            </button>
                          ))}
                        </div>

                        <span className="bg-olive/10 dark:bg-olive/20 text-olive text-xs px-2.5 py-1 rounded-md font-medium">
                          Calories: {scaleNutrient(selectedRecipe.nutritionalHighlights?.calories, servingsMultiplier)}
                          {servingsMultiplier > 1 && <span className="opacity-75 text-[10px] ml-1">({servingsMultiplier}x)</span>}
                        </span>
                        <span className="bg-olive/10 dark:bg-olive/20 text-olive text-xs px-2.5 py-1 rounded-md font-medium">
                          Protein: {scaleNutrient(selectedRecipe.nutritionalHighlights?.protein, servingsMultiplier)}
                          {servingsMultiplier > 1 && <span className="opacity-75 text-[10px] ml-1">({servingsMultiplier}x)</span>}
                        </span>
                        {selectedRecipe.equipment && (
                          <span className="bg-orange-burnt/10 dark:bg-orange-burnt/20 text-orange-burnt text-xs px-2.5 py-1 rounded-md font-medium flex items-center gap-1">
                            {getEquipmentIcon(selectedRecipe.equipment)} Gear: {selectedRecipe.equipment}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2 shrink-0 no-print">
                      {/* PRINT BUTTON */}
                      <button 
                        onClick={handlePrintRecipe}
                        title="Print recipe or save as clean PDF"
                        className="bg-cream hover:bg-cream-dark border border-olive/20 dark:border-olive/30 text-charcoal p-2.5 rounded-lg shadow-xs transition-all hover:border-orange-burnt active:scale-95 cursor-pointer text-sm"
                      >
                        🖨️
                      </button>

                      {/* FAVORITE BUTTON */}
                      <button 
                        onClick={() => toggleSaveRecipe(selectedRecipe)}
                        title={savedRecipes.some(r => r.id === selectedRecipe.id) ? "Remove from favorites" : "Save to favorites"}
                        className="bg-cream hover:bg-cream-dark border border-olive/20 dark:border-olive/30 p-2.5 rounded-lg shadow-xs transition-all hover:border-orange-burnt active:scale-95 text-sm cursor-pointer"
                      >
                        {savedRecipes.some(r => r.id === selectedRecipe.id) ? '⭐' : '☆'}
                      </button>
                      
                      {/* COPY BUTTON */}
                      <button 
                        onClick={handleCopyRecipe}
                        title="Copy full blueprint to clipboard"
                        className="bg-cream hover:bg-cream-dark border border-olive/20 dark:border-olive/30 text-charcoal p-2.5 rounded-lg shadow-xs transition-all hover:border-orange-burnt active:scale-95 cursor-pointer text-sm"
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
                          <span key={i} className="bg-olive text-white text-[11px] sm:text-xs px-2.5 py-1 rounded-md font-medium shadow-sm">✓ {ing}</span>
                        ))}
                      </div>
                    </div>
                    
                    {selectedRecipe.missingIngredients?.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <h5 className="text-xs uppercase tracking-wider font-semibold text-charcoal/50">Extra Minor Items Needed</h5>
                          <button
                            type="button"
                            onClick={copyShoppingList}
                            className="text-[10px] text-orange-burnt hover:underline font-semibold flex items-center gap-1 cursor-pointer no-print"
                            title="Copy shopping checklist to clipboard"
                          >
                            🛒 Copy Shopping List
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedRecipe.missingIngredients.map((ing, i) => {
                            const isChecked = !!checkedMissing[ing];
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={() => toggleMissingItem(ing)}
                                className={`text-[11px] sm:text-xs px-2.5 py-1 rounded-md font-medium transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                                  isChecked 
                                    ? 'bg-olive/20 text-olive line-through border border-olive/30' 
                                    : 'bg-orange-burnt/10 text-orange-burnt hover:bg-orange-burnt/20 border border-orange-burnt/20'
                                }`}
                                title="Click to check off item"
                              >
                                <span>{isChecked ? '☑' : '☐'}</span>
                                <span>{ing}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Substitutions */}
                  {selectedRecipe.substitutionTips?.length > 0 && (
                    <div className="bg-cream dark:bg-cream-dark/50 border-l-4 border-orange-burnt p-4 rounded-r-lg text-xs sm:text-sm text-charcoal/80 space-y-1 shadow-xs">
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
                        className="bg-orange-burnt text-white text-xs px-3.5 py-1.5 rounded-lg font-serif font-semibold hover:bg-orange-burnt/90 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        🧑‍🍳 Start Cooking
                      </button>
                    </div>
                    <ol className="space-y-3">
                      {selectedRecipe.instructions?.map((step, idx) => (
                        <li key={idx} className="flex gap-3 sm:gap-4 items-start text-xs sm:text-sm text-charcoal/90 leading-relaxed bg-cream/60 dark:bg-cream/40 p-4 rounded-xl border border-olive/5 dark:border-olive/15 shadow-xs transition-all duration-200">
                          <span className="bg-charcoal text-white dark:bg-[#252C21] dark:text-[#EDE8DE] dark:border dark:border-olive/20 font-serif text-xs rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center shrink-0 mt-0.5 font-bold shadow-sm">
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

        {/* FOOTER */}
        <div className="pt-8 border-t border-olive/10 dark:border-olive/20 flex flex-col sm:flex-row justify-between items-center text-xs text-charcoal/40 gap-3">
          <span>Flavr — Culinary Simplicity</span>
          <span className="text-charcoal/60 dark:text-charcoal/60 font-medium">
            made with ❤️ by shreyansh
          </span>
          <span>Powered by FreeLLMAPI Proxy</span>
        </div>
      </div>

      {/* SAVED RECIPES DRAWER */}
      <div 
        ref={favoritesDrawerRef} 
        className={`fixed top-0 right-0 h-full w-full sm:w-[420px] bg-cream shadow-2xl border-l border-olive/10 dark:border-olive/20 z-50 transition-all duration-300 transform no-print ${isSavedDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="p-6 h-full flex flex-col justify-between">
          <div className="space-y-3 border-b border-olive/10 dark:border-olive/20 pb-4">
            <div className="flex justify-between items-center">
              <h3 className="font-serif text-xl font-medium text-charcoal flex items-center gap-2">
                ⭐️ Favorite Recipes
              </h3>
              <button 
                onClick={() => setIsSavedDrawerOpen(false)}
                className="text-2xl text-charcoal hover:text-orange-burnt transition-colors focus:outline-none cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* LIVE SEARCH INSIDE FAVORITES */}
            {savedRecipes.length > 0 && (
              <div className="relative pt-1">
                <input
                  type="text"
                  value={favoritesSearch}
                  onChange={(e) => setFavoritesSearch(e.target.value)}
                  placeholder="Filter favorites by name, cuisine, gear..."
                  className="w-full bg-cream-dark/80 border border-olive/20 dark:border-olive/30 rounded-lg pl-8 pr-7 py-2 text-xs focus:outline-none focus:border-orange-burnt transition-all font-sans placeholder-charcoal/40"
                />
                <span className="absolute left-2.5 top-3 text-xs opacity-50">🔍</span>
                {favoritesSearch && (
                  <button
                    type="button"
                    onClick={() => setFavoritesSearch('')}
                    className="absolute right-2.5 top-2.5 text-charcoal/40 hover:text-charcoal text-xs font-bold cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>
            )}
          </div>
          
          <div className="flex-grow overflow-y-auto py-4 space-y-3">
            {savedRecipes.length === 0 ? (
              <div className="text-center py-12 text-charcoal/40 text-sm">
                <p className="text-3xl mb-2">🔖</p>
                <p>No bookmarked recipes yet.</p>
                <p className="text-xs mt-1">Bookmark recipes to save them here!</p>
              </div>
            ) : filteredFavorites.length === 0 ? (
              <div className="text-center py-12 text-charcoal/40 text-sm">
                <p className="text-3xl mb-2">🔍</p>
                <p>No favorites match "{favoritesSearch}"</p>
                <button
                  type="button"
                  onClick={() => setFavoritesSearch('')}
                  className="mt-2 text-xs text-orange-burnt underline cursor-pointer"
                >
                  Clear search
                </button>
              </div>
            ) : (
              filteredFavorites.map((recipe) => (
                <div 
                  key={recipe.id}
                  onClick={() => {
                    setRecipes([recipe, ...recipes.filter(r => r.id !== recipe.id)]);
                    setSelectedRecipe(recipe);
                    setIsSavedDrawerOpen(false);
                  }}
                  className="p-4 rounded-xl border border-olive/10 dark:border-olive/20 bg-cream-dark/50 hover:bg-cream-dark transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-semibold text-orange-burnt tracking-wide uppercase truncate">
                      {recipe.cuisine}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {recipe.equipment && (
                        <span className="text-[10px] text-olive font-medium bg-olive/10 dark:bg-olive/20 px-2 py-0.5 rounded truncate max-w-[120px]">
                          {getEquipmentIcon(recipe.equipment)} {recipe.equipment}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSaveRecipe(recipe);
                        }}
                        className="p-1 rounded-md text-charcoal/40 hover:text-red-500 hover:bg-red-500/10 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                        title="Remove Bookmark"
                        aria-label="Remove Bookmark"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <h4 className="font-serif font-medium text-sm text-charcoal line-clamp-1 group-hover:text-orange-burnt transition-colors">
                    {recipe.name}
                  </h4>
                  <p className="text-xs text-charcoal/50 mt-1 line-clamp-2 leading-relaxed">
                    {recipe.description}
                  </p>
                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-olive/5 dark:border-olive/15 text-[10px] text-charcoal/60">
                    <div className="flex items-center gap-3">
                      <span>⏱️ {recipe.cookTime}</span>
                      <span>🔥 {recipe.difficulty}</span>
                    </div>
                    <span className="text-olive font-medium group-hover:text-orange-burnt transition-colors">
                      Open recipe →
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="border-t border-olive/10 dark:border-olive/20 pt-4 flex items-center justify-between gap-2">
            <span className="text-[10px] text-charcoal/50">
              {filteredFavorites.length} of {savedRecipes.length} saved
            </span>
            <button 
              onClick={() => setIsSavedDrawerOpen(false)}
              className="bg-charcoal text-white dark:bg-[#252C21] dark:text-[#EDE8DE] dark:border dark:border-olive/20 px-5 py-2.5 rounded-lg text-xs font-medium hover:bg-charcoal/90 dark:hover:bg-[#2E362A] transition-all shadow-md cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Backdrop for saved drawer */}
      {isSavedDrawerOpen && (
        <div 
          onClick={() => setIsSavedDrawerOpen(false)}
          className="fixed inset-0 bg-charcoal/40 dark:bg-black/60 backdrop-blur-xs z-40 transition-opacity no-print"
        />
      )}

      {/* INTERACTIVE COOKING MODE OVERLAY */}
      {isCookModeOpen && activeCookRecipe && (
        <div className="fixed inset-0 bg-charcoal/90 dark:bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 transition-all duration-300 no-print">
          <div ref={cookModalRef} className="bg-cream w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col justify-between overflow-hidden max-h-[90vh] border border-olive/10 dark:border-olive/25">
            
            {/* Header */}
            <div className="bg-cream-dark p-5 border-b border-olive/15 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-orange-burnt tracking-wide uppercase">Cooking Mode</span>
                  {activeCookRecipe.equipment && (
                    <span className="text-[10px] bg-olive/10 dark:bg-olive/20 text-olive font-medium px-2 py-0.5 rounded">
                      {getEquipmentIcon(activeCookRecipe.equipment)} {activeCookRecipe.equipment}
                    </span>
                  )}
                </div>
                <h3 className="font-serif font-semibold text-lg sm:text-xl text-charcoal line-clamp-1">{activeCookRecipe.name}</h3>
              </div>
              <button 
                onClick={() => {
                  pauseTimer();
                  stopSpeaking();
                  setIsCookModeOpen(false);
                }}
                className="text-2xl text-charcoal hover:text-orange-burnt transition-colors focus:outline-none cursor-pointer"
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
              <span className="bg-charcoal text-white dark:bg-[#252C21] dark:text-[#EDE8DE] dark:border dark:border-olive/20 font-serif text-sm px-3 py-1 rounded-full font-bold">
                Step {activeCookStep + 1} of {activeCookRecipe.instructions.length}
              </span>

              {/* Step Text */}
              <p className="font-serif text-lg sm:text-xl md:text-2xl text-charcoal text-center leading-relaxed font-medium px-4">
                {activeCookRecipe.instructions[activeCookStep].replace(/^\*\*\d+\.\s*.*?\*\*\s*/, '')}
              </p>

              {/* Timer Dashboard (Conditionally rendered) */}
              {timerMaxSeconds > 0 && (
                <div className="flex flex-col items-center gap-4 bg-cream-dark/50 dark:bg-cream-dark/30 p-6 rounded-2xl border border-olive/10 dark:border-olive/20 w-full max-w-sm">
                  <div className="relative flex items-center justify-center">
                    {/* Circular Timer SVG */}
                    <svg className="w-32 h-32 transform -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r={radius}
                        stroke="currentColor"
                        className="text-olive/15 dark:text-olive/25"
                        strokeWidth="6"
                        fill="transparent"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r={radius}
                        stroke="currentColor"
                        className="text-orange-burnt transition-all duration-1000 ease-linear"
                        strokeWidth="6"
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
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
                      className="px-4 py-2 bg-charcoal text-white dark:bg-[#252C21] dark:text-[#EDE8DE] dark:border dark:border-olive/20 rounded-md text-xs font-semibold hover:bg-charcoal/90 dark:hover:bg-[#2E362A] transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      {isTimerRunning ? '⏸️ Pause' : '▶️ Start'}
                    </button>
                    <button
                      onClick={resetTimer}
                      className="px-4 py-2 border border-olive/20 text-charcoal rounded-md text-xs font-semibold hover:bg-cream-dark transition-all cursor-pointer"
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
                  const prevIdx = activeCookStep - 1;
                  setActiveCookStep(prevIdx);
                  resetTimerForStep(activeCookRecipe.instructions[prevIdx]);
                }}
                disabled={activeCookStep === 0}
                className="px-4 py-2.5 rounded-lg border border-olive/20 text-xs font-semibold hover:bg-cream disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                ◀ Previous
              </button>

              <button
                onClick={() => {
                  if (isSpeaking) {
                    stopSpeaking();
                  } else {
                    speakStep(activeCookRecipe.instructions[activeCookStep]);
                  }
                }}
                className={`p-2.5 rounded-full border transition-all flex items-center justify-center cursor-pointer ${isSpeaking ? 'bg-orange-burnt/10 border-orange-burnt text-orange-burnt animate-pulse' : 'bg-cream border-olive/20 hover:border-orange-burnt hover:text-orange-burnt'}`}
                title={isSpeaking ? "Stop speaking" : "Speak step instructions"}
              >
                🔊
              </button>

              <button
                onClick={() => {
                  stopSpeaking();
                  if (activeCookStep === activeCookRecipe.instructions.length - 1) {
                    setIsCookModeOpen(false);
                    showToast("🎉 Congratulations, you finished cooking!");
                  } else {
                    const nextIdx = activeCookStep + 1;
                    setActiveCookStep(nextIdx);
                    resetTimerForStep(activeCookRecipe.instructions[nextIdx]);
                  }
                }}
                className="px-5 py-2.5 bg-orange-burnt text-white rounded-lg text-xs font-semibold hover:bg-orange-burnt/90 transition-all shadow-sm cursor-pointer"
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