import './setupTests';

// setupTests.js exists only to register @testing-library/jest-dom's custom
// matchers with Jest's global `expect`. These tests prove that registration
// actually happened, so DOM assertions in the Trade button tests are real
// assertions and not silently missing matchers.
describe('setupTests', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('registers jest-dom matchers on the global expect', () => {
    const assertion = expect(document.body);

    expect(typeof assertion.toBeInTheDocument).toBe('function');
    expect(typeof assertion.toHaveTextContent).toBe('function');
    expect(typeof assertion.toHaveAttribute).toBe('function');
  });

  it('matches an element that is attached to the document', () => {
    const link = document.createElement('a');
    link.textContent = 'Trade';
    link.setAttribute('href', 'https://example.com');
    document.body.appendChild(link);

    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent('Trade');
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  it('does not match an element that was created but never attached', () => {
    const link = document.createElement('a');
    link.textContent = 'Trade';

    expect(link).not.toBeInTheDocument();
  });

  it('does not match an element after it is removed from the document', () => {
    const link = document.createElement('a');
    link.textContent = 'Trade';
    document.body.appendChild(link);
    expect(link).toBeInTheDocument();

    link.remove();

    expect(link).not.toBeInTheDocument();
  });

  it('fails loudly when a jest-dom matcher receives a non-element', () => {
    expect(() => expect('Trade').toBeInTheDocument()).toThrow();
    expect(() => expect(null).toHaveAttribute('href')).toThrow();
  });

  it('fails a jest-dom assertion when the expectation is wrong', () => {
    const link = document.createElement('a');
    link.textContent = 'Trade';
    document.body.appendChild(link);

    expect(() => expect(link).toHaveTextContent('Buy')).toThrow();
  });
});
