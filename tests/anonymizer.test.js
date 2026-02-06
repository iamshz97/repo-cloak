/**
 * Anonymizer Tests
 */

import { describe, it, expect } from 'vitest';
import { createAnonymizer, createDeanonymizer } from '../src/core/anonymizer.js';

describe('Anonymizer', () => {
    describe('createAnonymizer', () => {
        it('should replace exact matches', () => {
            const anonymizer = createAnonymizer([
                { original: 'Cuviva', replacement: 'ABCCompany' }
            ]);

            // Title case input -> Title case output (first letter upper, rest lower)
            expect(anonymizer('Hello Cuviva world')).toBe('Hello Abccompany world');
        });

        it('should handle all uppercase', () => {
            const anonymizer = createAnonymizer([
                { original: 'Cuviva', replacement: 'ABCCompany' }
            ]);

            expect(anonymizer('CUVIVA is great')).toBe('ABCCOMPANY is great');
        });

        it('should handle all lowercase', () => {
            const anonymizer = createAnonymizer([
                { original: 'Cuviva', replacement: 'ABCCompany' }
            ]);

            expect(anonymizer('cuviva is lower')).toBe('abccompany is lower');
        });

        it('should handle multiple replacements', () => {
            const anonymizer = createAnonymizer([
                { original: 'Cuviva', replacement: 'ABCCompany' },
                { original: 'Frontend', replacement: 'Client' }
            ]);

            // Both are Title case -> first upper + rest lower
            expect(anonymizer('Cuviva Frontend API')).toBe('Abccompany Client API');
        });

        it('should handle empty replacements', () => {
            const anonymizer = createAnonymizer([]);
            expect(anonymizer('Hello world')).toBe('Hello world');
        });

        it('should handle special regex characters in original', () => {
            const anonymizer = createAnonymizer([
                { original: 'test.value', replacement: 'replaced' }
            ]);

            // Title case preservation
            expect(anonymizer('This is Test.value here')).toBe('This is Replaced here');
        });

        it('should handle null or undefined replacements', () => {
            const anonymizer = createAnonymizer(null);
            expect(anonymizer('Hello world')).toBe('Hello world');
        });
    });

    describe('createDeanonymizer', () => {
        it('should reverse the anonymization', () => {
            const replacements = [
                { original: 'Cuviva', replacement: 'ABCCompany' }
            ];

            const deanonymizer = createDeanonymizer(replacements);

            // ABCCompany (Title case) -> Cuviva (Title case: first upper + rest lower)
            expect(deanonymizer('Hello ABCCompany world')).toBe('Hello Cuviva world');
        });

        it('should handle multiple replacements in reverse', () => {
            const replacements = [
                { original: 'Cuviva', replacement: 'ABCCompany' },
                { original: 'API', replacement: 'Service' }
            ];

            const deanonymizer = createDeanonymizer(replacements);

            // Title case -> Title case for both
            expect(deanonymizer('ABCCompany Service')).toBe('Cuviva Api');
        });

        it('should handle uppercase in reverse', () => {
            const replacements = [
                { original: 'Cuviva', replacement: 'ABCCompany' }
            ];

            const deanonymizer = createDeanonymizer(replacements);

            expect(deanonymizer('ABCCOMPANY')).toBe('CUVIVA');
        });

        it('should handle lowercase in reverse', () => {
            const replacements = [
                { original: 'Cuviva', replacement: 'ABCCompany' }
            ];

            const deanonymizer = createDeanonymizer(replacements);

            expect(deanonymizer('abccompany')).toBe('cuviva');
        });
    });
});

describe('Case transformation', () => {
    it('should preserve all uppercase', () => {
        const anonymizer = createAnonymizer([
            { original: 'SECRET', replacement: 'PUBLIC' }
        ]);

        expect(anonymizer('This is SECRET data')).toBe('This is PUBLIC data');
    });

    it('should preserve all lowercase', () => {
        const anonymizer = createAnonymizer([
            { original: 'secret', replacement: 'public' }
        ]);

        expect(anonymizer('this is secret data')).toBe('this is public data');
    });
});
