/**
 * Validate the assembled code and complexity blocks
 * @param {Array} assemblyArea - Array of code block items with {index, isDistractor}
 * @param {Array} complexityArea - Array of complexity indices
 * @param {Object} currentLevel - Current level configuration
 * @returns {Object} Validation result with isValid flag and errors (if any)
 */
export const validateAssembly = (assemblyArea, complexityArea, currentLevel) => {
  const codeComplete = assemblyArea.length === currentLevel.correctOrder.length;
  const complexityComplete = !currentLevel.hasComplexity || 
                             complexityArea.length === currentLevel.complexity.length;
  
  // Check if there are too many blocks
  if (assemblyArea.length > currentLevel.correctOrder.length) {
    return {
      isValid: false,
      errors: {
        type: 'too_many_blocks',
        message: `Too many code blocks! You need exactly ${currentLevel.correctOrder.length} blocks, but you have ${assemblyArea.length}.`
      }
    };
  }
  
  if (currentLevel.hasComplexity && complexityArea.length > currentLevel.complexity.length) {
    return {
      isValid: false,
      errors: {
        type: 'too_many_complexity',
        message: `Too many complexity blocks! You need exactly ${currentLevel.complexity.length} blocks, but you have ${complexityArea.length}.`
      }
    };
  }
  
  // Check if all blocks are placed
  const allBlocksPlaced = codeComplete && complexityComplete;
  
  // Not yet complete, no validation needed
  if (!allBlocksPlaced) {
    return { isValid: false, errors: null };
  }

  // Check for distractor blocks (incorrect code blocks)
  const hasDistractor = assemblyArea.some(item => item.isDistractor);
  
  if (hasDistractor) {
    return {
      isValid: false,
      errors: {
        type: 'distractor',
        message: 'You have included incorrect code blocks! Some blocks don\'t belong in this operation.'
      }
    };
  }
  
  // Check if code order is correct
  const codeCorrect = assemblyArea.every((item, pos) => 
    !item.isDistractor && item.index === currentLevel.correctOrder[pos]
  );
  
  // Check if complexity matching is correct
  let complexityCorrect = true;
  let complexityErrors = [];
  
  if (currentLevel.hasComplexity) {
    complexityArea.forEach((actualComplexity, pos) => {
      const expectedComplexity = currentLevel.complexity[pos];
      // ✅ 直接比较字符串（因为现在是 'O(1)' 而不是索引）
      if (expectedComplexity !== actualComplexity) {
        complexityCorrect = false;
        complexityErrors.push({
          line: pos + 1,
          expected: expectedComplexity,
          actual: actualComplexity
        });
      }
    });
  }
  
  const allCorrect = codeCorrect && complexityCorrect;
  
  // Everything is correct
  if (allCorrect) {
    return { isValid: true, errors: null };
  }
  
  // Generate specific error messages
  if (!codeCorrect) {
    // Find which lines are in wrong order
    const wrongLines = assemblyArea
      .map((item, pos) => {
        if (item.index !== currentLevel.correctOrder[pos]) {
          return pos + 1;
        }
        return null;
      })
      .filter(x => x !== null);
    
    return {
      isValid: false,
      errors: {
        type: 'code_order',
        message: `Code sequence is incorrect. Check line(s): ${wrongLines.join(', ')}`,
        wrongLines
      }
    };
  }
  
  if (!complexityCorrect) {
    return {
      isValid: false,
      errors: {
        type: 'complexity',
        message: 'Time complexity analysis is incorrect.',
        errors: complexityErrors
      }
    };
  }
  
  return { isValid: false, errors: null };
};