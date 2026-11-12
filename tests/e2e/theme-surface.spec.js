import { test, expect } from './support/fixtures.js';

function rgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

test('settings and the application panel use the site paper, ink, and lime', async ({ kr }, testInfo) => {
  const options = await kr.context.newPage();
  await options.goto(kr.optionsUrl());
  const optionsColors = await options.evaluate(() => {
    document.querySelector('#profile-form').hidden = false;
    const body = getComputedStyle(document.documentElement);
    const button = getComputedStyle(document.querySelector('#save-resume'));
    const secondary = getComputedStyle(document.querySelector('#add-work-btn'));
    let focus = '';
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText === ':focus-visible') focus = rule.style.outline;
      }
    }
    return {
      scheme: body.colorScheme,
      background: body.backgroundColor,
      text: body.color,
      buttonBackground: button.backgroundColor,
      buttonText: button.color,
      secondaryBackground: secondary.backgroundColor,
      secondaryText: secondary.color,
      focus,
    };
  });
  expect(optionsColors.scheme).toBe('light');
  expect(optionsColors.background).toBe(rgb('#f7f6f0'));
  expect(optionsColors.text).toBe(rgb('#20231c'));
  expect(optionsColors.buttonBackground).toBe(rgb('#20231c'));
  expect(optionsColors.buttonText).toBe(rgb('#f7f6f0'));
  expect(optionsColors.secondaryBackground).toBe(rgb('#efeee6'));
  expect(optionsColors.secondaryText).toBe(rgb('#20231c'));
  expect(optionsColors.focus).toContain('var(--kr-focus)');
  await options.locator('#save-resume').scrollIntoViewIfNeeded();
  await options.screenshot({ path: testInfo.outputPath('settings-paper.png'), fullPage: false });

  const application = await kr.context.newPage();
  await application.goto(kr.fixtureUrl('store-demo-application.html'));
  await kr.openPanel(application);
  const panel = application.locator('#kr-main-panel');
  const panelColors = await panel.evaluate(element => {
    const panelStyle = getComputedStyle(element);
    const button = element.querySelector('#kr-autofill-btn');
    const buttonStyle = button ? getComputedStyle(button) : null;
    return {
      scheme: panelStyle.colorScheme,
      background: panelStyle.backgroundColor,
      text: panelStyle.color,
      buttonBackground: buttonStyle?.backgroundColor || '',
      buttonText: buttonStyle?.color || '',
    };
  });
  expect(panelColors.scheme).toBe('light');
  expect(panelColors.background).toBe(rgb('#fffefa'));
  expect(panelColors.text).toBe(rgb('#20231c'));
  expect(panelColors.buttonBackground).toBe(rgb('#20231c'));
  expect(panelColors.buttonText).toBe(rgb('#f7f6f0'));
  await application.screenshot({ path: testInfo.outputPath('panel-paper.png'), fullPage: false });
});
