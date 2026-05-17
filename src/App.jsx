import React, { useState } from 'react';
import { generateRecipesFromPantry } from './geminiService';

const COMMON_INGREDIENTS = [
  "onion", "garlic", "ginger", "tomato", "potato", "carrot", "cabbage", "spinach", 
  "egg", "chicken", "beef", "pork", "shrimp", "fish", "tofu", "milk", "cheese", 
  "butter", "heavy cream", "yogurt", "rice", "pasta", "flour", "bread", "olive oil", 
  "vegetable oil", "salt", "black pepper", "soy sauce", "sugar", "lemon", "lime"
];

export default function App() {
  const [ingredients, setIngredients] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [toastMessage, setToastMessage] = useState('');

  const [recipes, setRecipes] = useState([]);
  const [aiNudge, setAiNudge] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  
  const [selectedRecipe, setSelectedRecipe] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    const timer = setTimeout(() => setToastMessage(''), 4000);
    return () => clearTimeout(timer);
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

    setIngredients((prev) => [...prev, cleanItem]);
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
    setIngredients(ingredients.filter((_, index) => index !== indexToRemove));
  };

  // FEATURE 1: BUTTERY PANTRY RESET METHOD
  const clearPantry = () => {
    setIngredients([]);
    setRecipes([]);
    setSelectedRecipe(null);
    setAiNudge('');
    setApiError('');
    showToast("Pantry reset successfully!");
  };

  // FEATURE 2: CLIPBOARD BLUEPRINT COPY EXECUTOR
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

Generated beautifully via Recipe Finder 🧠
    `.trim();

    navigator.clipboard.writeText(formattedText);
    showToast("Recipe blueprint copied to clipboard!");
  };

  const handleFindRecipes = async () => {
    setIsLoading(true);
    setApiError('');
    setAiNudge('');
    setSelectedRecipe(null);
    
    try {
      const data = await generateRecipesFromPantry(ingredients);
      
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
    }
  };

  return (
    <div className="min-h-screen bg-cream text-charcoal font-sans flex flex-col md:flex-row relative overflow-x-hidden">
      
      {/* TOAST WARNINGS */}
      <div className={`fixed top-5 right-5 bg-charcoal text-cream px-5 py-3.5 rounded-lg shadow-2xl text-xs tracking-wide font-medium border border-orange-burnt/20 z-50 transition-all duration-300 transform ${toastMessage ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0 pointer-events-none'}`}>
        ⚠️ {toastMessage}
      </div>
      
      {/* CONTROL INTERFACE PANEL */}
      <div className="w-full md:w-2/5 p-6 sm:p-8 md:p-12 bg-cream-dark border-b md:border-b-0 md:border-r border-olive/10 flex flex-col justify-between shrink-0 min-h-[45vh] md:min-h-screen">
        <div className="space-y-6 md:space-y-8">
          <div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-medium text-charcoal tracking-tight mb-2">
              Recipe Finder
            </h1>
            <p className="text-xs sm:text-sm text-charcoal/70 italic font-serif">
              Flip the kitchen script. Tell us what you have, we'll tell you what to cook.
            </p>
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
                placeholder={isLoading ? "Chef is thinking..." : "Type ingredient and hit Enter..."}
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
                <span className="animate-spin text-xl">⏳</span> Preparing Menu...
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
              <span className="text-4xl sm:text-5xl inline-block animate-spin">🍳</span>
              <h3 className="font-serif text-lg sm:text-xl font-medium text-charcoal">Analyzing flavor profiles...</h3>
              <p className="text-xs text-charcoal/50">Drafting step-by-step beginner cooking logs.</p>
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
                        onClick={() => setSelectedRecipe(recipe)}
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
                    
                    {/* FEATURE 2: COPY BUTTON CONTAINER */}
                    <button 
                      onClick={handleCopyRecipe}
                      title="Copy full blueprint to clipboard"
                      className="bg-cream hover:bg-cream-dark border border-olive/20 text-charcoal p-2.5 rounded-lg shadow-xs transition-all hover:border-orange-burnt active:scale-95 shrink-0"
                    >
                      📋
                    </button>
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
                    <h5 className="text-xs uppercase tracking-wider font-semibold text-charcoal/50">Culinary Execution Steps</h5>
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

        {/* FEATURE 3: THE SIGNATURE FOOTER */}
        <div className="w-full text-center pt-12 pb-2 md:pb-0 border-t border-charcoal/5 mt-auto">
          <p className="font-serif italic text-xs text-charcoal/40 tracking-wide">
            Made by Soumya with 🧠
          </p>
        </div>

      </div>

    </div>
  );
}