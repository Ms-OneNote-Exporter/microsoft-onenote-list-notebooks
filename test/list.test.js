const path = require('path');
const fs = require('fs-extra');

describe('List Notebooks Module', () => {
    describe('listNotebooks', () => {
        it('should throw error when auth file does not exist', async () => {
            const { listNotebooks } = require('../src/list-notebooks');
            await expect(listNotebooks({ authFile: '/nonexistent/auth.json' }))
                .rejects
                .toThrow(/Authentication file not found/);
        });
    });

    describe('dismissMcasInterstitial', () => {
        it('should return false when not on MCAS URL', async () => {
            const { dismissMcasInterstitial } = require('../src/list-notebooks');
            const mockPage = {
                url: () => 'https://www.onenote.com/notebooks'
            };
            const result = await dismissMcasInterstitial(mockPage);
            expect(result).toBe(false);
        });
    });
});
