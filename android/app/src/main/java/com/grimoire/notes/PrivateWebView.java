package com.grimoire.notes;

import android.content.Context;
import android.util.AttributeSet;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import com.getcapacitor.CapacitorWebView;

/**
 * WebView that asks the system keyboard not to learn from anything typed
 * in this app (incognito keyboard). Everything else behaves exactly like
 * the default Capacitor WebView.
 */
public class PrivateWebView extends CapacitorWebView {

    public PrivateWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection connection = super.onCreateInputConnection(outAttrs);
        if (connection != null && outAttrs != null) {
            outAttrs.imeOptions |= EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING;
        }
        return connection;
    }
}
