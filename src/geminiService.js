/**
 * FreeLLMAPI Proxy Service for Flavr
 * Routes requests to the OpenAI-compatible FreeLLMAPI proxy hosted on Render:
 * https://my-freellmapi-proxy.onrender.com/v1/chat/completions
 */

const DEFAULT_PROXY_BASE = 'https://my-freellmapi-proxy.onrender.com/v1';
const DEFAULT_UNIFIED_KEY = 'freellmapi-6c693465337e36eae695139f44da8dec2ae5f10389be9471';

/**
 * Normalizes proxy base URL or full endpoint URL to ensure valid chat completion endpoint.
 */
function getProxyEndpoint(rawUrl) {
  const base = (rawUrl || DEFAULT_PROXY_BASE).trim().replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) {
    return base;
  }
  if (base.endsWith('/v1')) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

/**
 * Robust JSON parser that handles:
 * - Direct raw JSON strings
 * - Fenced JSON blocks (```json ... ``` or ``` ... ```)
 * - Reasoning / CoT blocks (<think>...</think>)
 * - Preamble or trailing conversational text
 */
function parseJSONResponse(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Received empty or invalid text response from AI proxy.');
  }

  // 1. Strip reasoning blocks like <think>...</think> produced by deep-thinking models
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Attempt direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue to pattern extraction
  }

  // 3. Extract JSON inside markdown code fence
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // Continue
    }
  }

  // 4. Extract first balanced or bracketed JSON object
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue
    }
  }

  throw new Error('Could not parse culinary recipe response as valid JSON.');
}

/**
 * Validates and normalizes recipes to ensure UI components don't encounter undefined errors.
 */
function normalizeRecipeData(data, preferences = {}) {
  const rawIsValid = data?.sanityCheck?.isValidCombination;
  const isExplicitlyInvalid = rawIsValid === false || rawIsValid === 'false' || rawIsValid === 0;
  const rawRecipes = Array.isArray(data?.recipes) ? data.recipes : [];
  
  // If explicitly flagged invalid or no recipes with a nudgeMessage present
  const isValidCombination = !isExplicitlyInvalid && (rawRecipes.length > 0 || !data?.sanityCheck?.nudgeMessage);

  const sanityCheck = {
    isValidCombination,
    confidenceScore: typeof data?.sanityCheck?.confidenceScore === 'number' 
      ? data.sanityCheck.confidenceScore 
      : (isValidCombination ? 1.0 : 0.0),
    nudgeMessage: data?.sanityCheck?.nudgeMessage || ''
  };

  const defaultGear = Array.isArray(preferences?.equipment) && preferences.equipment.length > 0 
    ? preferences.equipment.join(', ') 
    : 'Standard Cookware';

  const recipes = rawRecipes.map((recipe, index) => ({
    id: recipe.id || `recipe-${Date.now()}-${index}`,
    name: recipe.name || 'Untitled Culinary Dish',
    cuisine: recipe.cuisine || 'Fusion',
    cookTime: recipe.cookTime || '20 mins',
    difficulty: recipe.difficulty || 'Easy',
    equipment: recipe.equipment || defaultGear,
    description: recipe.description || 'A delicious dish crafted with your kitchen ingredients.',
    matchedIngredients: Array.isArray(recipe.matchedIngredients) ? recipe.matchedIngredients : [],
    missingIngredients: Array.isArray(recipe.missingIngredients) ? recipe.missingIngredients : [],
    nutritionalHighlights: {
      calories: recipe.nutritionalHighlights?.calories || 'approx 350 kcal',
      protein: recipe.nutritionalHighlights?.protein || 'approx 15g'
    },
    substitutionTips: Array.isArray(recipe.substitutionTips) ? recipe.substitutionTips : [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : ['Prepare ingredients and cook to taste.']
  }));

  return { sanityCheck, recipes };
}

/**
 * Sends ingredients to FreeLLMAPI proxy on Render to get ranked, beginner-friendly recipes.
 * Supports dietary preferences, meal types, and kitchen equipment/appliances constraints.
 * @param {Array<string>} ingredientsList 
 * @param {Object} preferences
 * @returns {Promise<Object>} Formatted recipes or sanity check errors
 */
export async function generateRecipesFromPantry(ingredientsList, preferences = {}) {
  const { diet, mealType, equipment } = preferences;
  let preferenceInstructions = '';
  if (diet && diet !== 'none') {
    preferenceInstructions += `\nDIETARY RESTRICTION: You MUST only generate recipes that are strictly ${diet}. Ensure all ingredients, instructions, and substitutions conform to a ${diet} diet.`;
  }
  if (mealType && mealType !== 'none') {
    preferenceInstructions += `\nMEAL TYPE: All recipes generated must be ideal for ${mealType} (adjust portions, style, and cooking style accordingly).`;
  }
  if (Array.isArray(equipment) && equipment.length > 0) {
    preferenceInstructions += `\nAVAILABLE COOKING APPLIANCES & GEAR: [${equipment.join(', ')}].
CRITICAL EQUIPMENT RESTRICTION: The user ONLY has access to the appliances/tools listed above. You MUST STRICTLY only generate recipes that can be 100% prepared using ONLY these specified tools. DO NOT require an oven, stovetop, air fryer, blender, or any cookware/heat source not in this list. In the instructions, specifically explain how to prepare the dish using the available tools (e.g. if the user only has an Electric Kettle, explain how to boil water, steep, poach, or cook directly using the kettle). In each recipe's "equipment" field, state the primary tool used.`;
  }

  const prompt = `
You are an expert culinary chef with Michelin-grade standards, sharp wit, and a commanding, theatrical presence in the kitchen.

PHASE 1 — MANDATORY FOOD SAFETY & SANITY CHECK:
Scrutinize the user's provided ingredient list: [${ingredientsList.join(', ')}].
Detect if the list contains ANY:
1. Inedible, non-food, hazardous, or biological/mythical parts (e.g. "human skull", "dragon eye", "rocks", "shoes", "plastic", "poison", "bleach", anatomy, magical/fantasy items).
2. Completely uncookable, absurd, or repulsive combinations that no chef could ever make into edible food.

CRITICAL INSTRUCTION FOR INAPPROPRIATE / ABSURD INGREDIENTS:
If ANY inappropriate, inedible, mythical, or dangerous ingredient is present:
- You MUST set "isValidCombination": false
- You MUST set "confidenceScore": 0.0
- You MUST set "recipes": []
- In "nudgeMessage", you MUST generate a HILARIOUS YET IMPOSING chef response.
  PERSONA: A demanding, theatrical master chef (think Gordon Ramsay meets a sarcastic kitchen monarch).
  STYLE: Witty, sarcastic, playfully menacing, and strictly imposing.
  CONTENT:
  1. Call out the specific ridiculous or inappropriate ingredient(s) directly by name.
  2. Deliver a sharp, hilarious roast questioning what dark dungeon, crime scene, or fantasy necromancer lair they raided.
  3. Authoritatively command them to step away from the forbidden items and bring actual, edible food into your kitchen!
  Keep it punchy, memorable, and funny (2 to 4 sentences).

PHASE 2 — RECIPE GENERATION (Only if all ingredients are edible and valid):
If the ingredients are edible and cohesive:
- Set "isValidCombination": true
- "nudgeMessage": (Optional) a brief culinary tip or nudge.
- Generate 3 to 5 realistic recipes ranked by how well the provided ingredients match, conforming strictly to any dietary, meal, and equipment preferences.
${preferenceInstructions}

CRITICAL INSTRUCTION FOR BEGINNERS: For the step-by-step cooking instructions, do not assume any prior kitchen knowledge. Explain HOW to do a technique if necessary, include explicit visual or sensory cues (e.g., "cook until the onions turn translucent and soft, about 5 minutes", "it should smell fragrant"), and give helpful, clear safety or execution tips for each step.

Available Ingredients: [${ingredientsList.join(', ')}]

You MUST respond strictly using the following JSON schema format without markdown fences or conversational filler text:
{
  "sanityCheck": {
    "isValidCombination": true,
    "confidenceScore": 0.95,
    "nudgeMessage": ""
  },
  "recipes": [
    {
      "id": "1",
      "name": "Name of the dish",
      "cuisine": "Cuisine type",
      "cookTime": "Estimated total time (e.g., 25 mins)",
      "difficulty": "Easy",
      "equipment": "Primary tool used (e.g. Electric Kettle, Air Fryer, Stovetop Pan, Microwave, No-Cook)",
      "description": "A short, appetizing text description of the dish.",
      "matchedIngredients": ["ingredient from list used"],
      "missingIngredients": ["minimal extra everyday items needed, shown clearly"],
      "nutritionalHighlights": {
        "calories": "approx 350 kcal",
        "protein": "approx 15g"
      },
      "substitutionTips": [
        "Tip for substituting a missing ingredient if they don't have it"
      ],
      "instructions": [
        "Detailed, beginner-reliant step 1 with visual/timing cues.",
        "Detailed, beginner-reliant step 2 with visual/timing cues."
      ]
    }
  ]
}
`.trim();

  const rawProxyUrl = import.meta.env?.VITE_FREELLMAPI_URL || 
                      import.meta.env?.VITE_BASE_URL || 
                      import.meta.env?.VITE_API_BASE_URL ||
                      DEFAULT_PROXY_BASE;

  const proxyUrl = getProxyEndpoint(rawProxyUrl);

  const proxyKey = import.meta.env?.VITE_OPENAI_API_KEY || 
                   import.meta.env?.VITE_FREELLMAPI_KEY || 
                   DEFAULT_UNIFIED_KEY;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${proxyKey.trim()}`
  };

  const requestBody = {
    model: 'auto',
    messages: [
      {
        role: 'system',
        content: 'You are an elite, Michelin-caliber Master Chef API engine with sharp wit, commanding kitchen standards, and a delightfully imposing sense of humor. You output strictly valid JSON only.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  };

  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr = errText;
      try {
        const jsonErr = JSON.parse(errText);
        parsedErr = jsonErr.error?.message || jsonErr.message || errText;
      } catch {
        // use raw text
      }
      throw new Error(`FreeLLMAPI proxy error (${response.status}): ${parsedErr}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || data.content;
    if (!responseText) {
      throw new Error('FreeLLMAPI proxy returned an empty response.');
    }

    const parsedData = parseJSONResponse(responseText);
    return normalizeRecipeData(parsedData, preferences);
  } catch (proxyError) {
    console.error('FreeLLMAPI proxy call failed:', proxyError);
    throw new Error(proxyError.message || 'Failed to generate recipes from FreeLLMAPI proxy.', { cause: proxyError });
  }
}