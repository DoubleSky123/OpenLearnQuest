# Linked List Code Assembly Game - Project Structure

## 📁 File Organization

```
src/
├── constants/
│   └── levels.js                    # Game level configurations and color mappings
│
├── utils/
│   └── helpers.js                   # Utility functions (shuffle, pattern operations)
│
├── services/
│   ├── linkedListOperations.js     # Linked list operation logic
│   └── validationLogic.js          # Code validation and error checking
│
├── components/
│   ├── LevelSelector.jsx           # Level selection UI
│   ├── FeedbackMessage.jsx         # Success/completion messages
│   ├── GoalPattern.jsx             # Target pattern display
│   ├── HintBox.jsx                 # Hint display component
│   ├── CodeBlock.jsx               # Individual code block
│   ├── ComplexityBlock.jsx         # Time complexity block
│   ├── CodePool.jsx                # Draggable blocks container
│   ├── AssemblyArea.jsx            # Code assembly workspace
│   └── LinkedListVisualization.jsx # Linked list state display
│
└── App.jsx                          # Main application component (ENTRY POINT)
```

## 🎯 Module Responsibilities

### **constants/levels.js**
- Defines `COLORS` mapping (emoji circles)
- Contains all 6 level configurations with:
  - Goal patterns
  - Initial nodes
  - Operations
  - Pseudocode steps
  - Distractor blocks
  - Hints

### **utils/helpers.js**
- `shuffleArray()` - Randomize block order
- `formatPatternValue()` - Format display values
- `getCurrentPattern()` - Extract current linked list pattern

### **services/linkedListOperations.js**
- `executeLinkedListOperation()` - Performs all linked list operations:
  - Insert at head/tail/position
  - Remove at head/tail/position
  - Returns new node state and success message

### **services/validationLogic.js**
- `validateAssembly()` - Validates user's code assembly:
  - Checks for distractor blocks
  - Verifies code order
  - Validates time complexity matching
  - Returns detailed error messages

### **Components**

#### Small Components:
- **LevelSelector** - Level navigation buttons
- **FeedbackMessage** - Colored feedback notifications
- **GoalPattern** - Visual goal representation
- **HintBox** - Helpful hints
- **CodeBlock** - Single draggable code line
- **ComplexityBlock** - Single complexity badge

#### Complex Components:
- **CodePool** - Manages available blocks (code + complexity)
- **AssemblyArea** - Drag-and-drop workspace with error display
- **LinkedListVisualization** - Shows current state and memory structure

### **App.jsx** (Main Entry Point)
- State management for entire game
- Orchestrates all components
- Handles drag-and-drop logic
- Manages level progression
- **This is what runs the application**

## 🚀 How to Use These Files

### In a Real React Project:

1. **Create the folder structure** as shown above
2. **Copy each file** to its corresponding location
3. **Install dependencies:**
   ```bash
   npm install lucide-react
   ```
4. **Run the app:**
   ```bash
   npm start
   ```

### Import Flow:
```
App.jsx (imports everything)
  ↓
constants/levels.js ← level data
  ↓
utils/helpers.js ← utility functions
  ↓
services/* ← business logic
  ↓
components/* ← UI components
```

## 🔧 Key Features by Module

| Feature | File Location |
|---------|--------------|
| Level configurations | `constants/levels.js` |
| Randomization | `utils/helpers.js` |
| Linked list operations | `services/linkedListOperations.js` |
| Error validation | `services/validationLogic.js` |
| Drag-and-drop | `App.jsx` |
| UI components | `components/*.jsx` |

## 📝 Notes

- All components use ES6 modules (`import/export`)
- Components are functional with React Hooks
- Drag-and-drop uses native HTML5 API
- Styling uses Tailwind CSS utility classes
- Game state is managed in `App.jsx` and passed down as props

## 🎮 Game Flow

1. User selects a level (`LevelSelector`)
2. Blocks are shuffled (`utils/helpers.shuffleArray`)
3. User drags blocks to assembly area (`AssemblyArea`)
4. Validation checks correctness (`services/validationLogic`)
5. If correct, operation executes (`services/linkedListOperations`)
6. Visualization updates (`LinkedListVisualization`)
7. Level completes when goal pattern matches

---

**Entry Point:** `App.jsx` is the main component that gets rendered!