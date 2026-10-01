export interface Preset { id: string; name: string; description: string; source: string }

export const presets: Preset[] = [
  { id: "sum", name: "Sum an array", description: "Accumulate values one by one.", source: `const numbers = [3, 5, 2, 8];\nlet total = 0;\nfor (const number of numbers) {\n  total += number;\n}\nconsole.log("Total:", total);` },
  { id: "max", name: "Find maximum", description: "Keep the largest value seen.", source: `const numbers = [4, 9, 2, 12, 7];\nlet max = numbers[0];\nfor (let i = 1; i < numbers.length; i++) {\n  if (numbers[i] > max) {\n    max = numbers[i];\n  }\n}\nconsole.log("Max:", max);` },
  { id: "reverse", name: "Reverse an array", description: "Swap values from both ends.", source: `const values = [1, 2, 3, 4, 5];\nlet left = 0;\nlet right = values.length - 1;\nwhile (left < right) {\n  const temp = values[left];\n  values[left] = values[right];\n  values[right] = temp;\n  left++;\n  right--;\n}\nconsole.log(values);` },
  { id: "bubble", name: "Bubble sort", description: "Compare neighbors and bubble large values right.", source: `const values = [5, 1, 4, 2, 8];\nfor (let end = values.length - 1; end > 0; end--) {\n  for (let i = 0; i < end; i++) {\n    if (values[i] > values[i + 1]) {\n      const temp = values[i];\n      values[i] = values[i + 1];\n      values[i + 1] = temp;\n    }\n  }\n}\nconsole.log(values);` },
  { id: "fizzbuzz", name: "FizzBuzz 1–15", description: "Follow a multi-branch condition.", source: `for (let i = 1; i <= 15; i++) {\n  if (i % 15 === 0) {\n    console.log("FizzBuzz");\n  } else if (i % 3 === 0) {\n    console.log("Fizz");\n  } else if (i % 5 === 0) {\n    console.log("Buzz");\n  } else {\n    console.log(i);\n  }\n}` },
  { id: "factorial", name: "Recursive factorial", description: "Watch function calls build and unwind.", source: `function factorial(n) {\n  if (n <= 1) {\n    return 1;\n  }\n  return n * factorial(n - 1);\n}\n\nconst result = factorial(5);\nconsole.log("5! =", result);` },
];

export const defaultPreset = presets.find((preset) => preset.id === "bubble")!;
