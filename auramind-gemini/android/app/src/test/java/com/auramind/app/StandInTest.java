package com.auramind.app;

import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The registered pre-rename widget class must run the BonaMind widget code. */
public class StandInTest {
    @Test
    public void widgetStandInExtendsTheRealProvider() {
        assertTrue(BonaMindWidgetProvider.class.isAssignableFrom(AuraMindWidgetProvider.class)); // legacy-name: ok
    }
}
