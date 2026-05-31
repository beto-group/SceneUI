const STYLES = {
    fullTabWrapper: {
        width: '100%',
        height: '100%',
        position: 'relative',
        backgroundColor: 'var(--background-primary)',
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        color: 'var(--text-normal)',
        fontFamily: 'var(--font-interface, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif)'
    },
    canvas: {
        width: '100%',
        height: '100%',
        display: 'block'
    },
    guiContainer: {
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        zIndex: 100,
        maxHeight: '90vh',
        overflowY: 'auto'
    }
};

return { STYLES };
