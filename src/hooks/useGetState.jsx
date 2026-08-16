import { useState, useRef, useCallback } from 'react';

export const useGetState = (initState) => {
    const [state, setState] = useState(initState);
    const stateRef = useRef(state);
    // eslint-disable-next-line react-hooks/refs -- keep the latest state immediately available to callbacks
    stateRef.current = state;
    const getState = useCallback(() => stateRef.current, []);
    return [state, setState, getState];
};
