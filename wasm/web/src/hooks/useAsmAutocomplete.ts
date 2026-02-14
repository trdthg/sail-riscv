import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  applyAsmSuggestionToInput,
  createAsmNames,
  createAsmSuggestions,
  createAsmTemplates,
  createRegisterSuggestions,
} from '../lib/asmAutocomplete';

export const useAsmAutocomplete = ({
  assemblyInput,
  setAssemblyInput,
  asmInputRef,
  udbState,
}) => {
  const [asmOpen, setAsmOpen] = useState(false);
  const [asmHighlight, setAsmHighlight] = useState(0);
  const [asmDropdownPos, setAsmDropdownPos] = useState(null);
  const [asmFocused, setAsmFocused] = useState(false);
  const asmSuppressOpenRef = useRef(false);

  const asmNames = useMemo(() => {
    if (udbState.state !== 'hasData') return [];
    return createAsmNames(udbState.data);
  }, [udbState]);

  const asmTemplates = useMemo(() => {
    if (udbState.state !== 'hasData') return new Map();
    return createAsmTemplates(udbState.data);
  }, [udbState]);

  const registerSuggestions = useMemo(() => createRegisterSuggestions(), []);

  const asmSuggestions = useMemo(() => createAsmSuggestions({
    assemblyInput,
    asmNames,
    registerSuggestions,
    asmTemplates,
  }), [asmNames, asmTemplates, assemblyInput, registerSuggestions]);

  const hasMeaningfulInput = assemblyInput.trim().length > 0;

  const { autocompleteState, autocompleteMessage } = useMemo(() => {
    if (!asmFocused || !hasMeaningfulInput) {
      return { autocompleteState: 'ready', autocompleteMessage: '' };
    }
    if (udbState.state === 'loading') {
      return {
        autocompleteState: 'udb-loading',
        autocompleteMessage:
          'Instruction index loading, autocomplete will be available shortly.',
      };
    }
    if (udbState.state === 'hasError') {
      const detail = udbState.error?.message
        ? `: ${String(udbState.error.message)}`
        : '.';
      return {
        autocompleteState: 'udb-error',
        autocompleteMessage: `Instruction index unavailable${detail}`,
      };
    }
    if (!asmSuggestions.length) {
      return {
        autocompleteState: 'no-match',
        autocompleteMessage: 'No suggestions for current token.',
      };
    }
    return { autocompleteState: 'ready', autocompleteMessage: '' };
  }, [asmFocused, asmSuggestions.length, hasMeaningfulInput, udbState]);

  useEffect(() => {
    if (!asmFocused) {
      setAsmOpen(false);
      setAsmHighlight(0);
      return;
    }
    if (!hasMeaningfulInput) {
      setAsmOpen(false);
      setAsmHighlight(0);
      return;
    }
    if (udbState.state !== 'hasData') {
      setAsmOpen(false);
      setAsmHighlight(0);
      return;
    }
    if (!asmSuggestions.length) {
      setAsmOpen(false);
      setAsmHighlight(0);
      return;
    }
    if (asmSuppressOpenRef.current) {
      asmSuppressOpenRef.current = false;
      setAsmOpen(false);
      setAsmHighlight(0);
      return;
    }
    setAsmOpen(true);
    setAsmHighlight(0);
  }, [asmFocused, asmSuggestions, hasMeaningfulInput, udbState]);

  useLayoutEffect(() => {
    if (!asmOpen || !asmInputRef.current) {
      setAsmDropdownPos(null);
      return;
    }
    const update = () => {
      const rect = asmInputRef.current.getBoundingClientRect();
      setAsmDropdownPos({
        left: rect.left,
        top: rect.bottom + 6,
        width: rect.width,
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [asmInputRef, asmOpen]);

  const applyAsmSuggestion = (suggestion) => {
    asmSuppressOpenRef.current = true;
    setAssemblyInput((previous) => applyAsmSuggestionToInput(previous, suggestion));
    setAsmOpen(false);
  };

  return {
    asmOpen,
    setAsmOpen,
    asmHighlight,
    setAsmHighlight,
    asmDropdownPos,
    setAsmFocused,
    asmSuggestions,
    applyAsmSuggestion,
    autocompleteState,
    autocompleteMessage,
  };
};
