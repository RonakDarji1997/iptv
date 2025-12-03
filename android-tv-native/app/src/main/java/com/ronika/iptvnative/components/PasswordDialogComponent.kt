package com.ronika.iptvnative.components

import android.app.Dialog
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Button
import android.widget.EditText
import com.ronika.iptvnative.database.AppDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Simple password dialog for adult/censored content
 */
class PasswordDialogComponent(
    context: Context,
    private val onPasswordCorrect: () -> Unit,
    private val onCancel: () -> Unit = {}
) : Dialog(context) {
    
    private val database by lazy { AppDatabase.getDatabase(context) }
    private val coroutineScope = CoroutineScope(Dispatchers.Main)
    
    private lateinit var pinInput: EditText
    private lateinit var errorText: TextView
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Create dialog layout programmatically
        val container = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF1A1A1A.toInt())
            setPadding(80, 60, 80, 60)
            gravity = Gravity.CENTER_HORIZONTAL
        }
        
        // Title
        val title = TextView(context).apply {
            text = "Adult Content"
            setTextColor(Color.WHITE)
            textSize = 28f
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 16)
        }
        container.addView(title)
        
        // Subtitle
        val subtitle = TextView(context).apply {
            text = "Enter PIN to access this content"
            setTextColor(0xFFAAAAAA.toInt())
            textSize = 18f
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 40)
        }
        container.addView(subtitle)
        
        // PIN input field
        pinInput = EditText(context).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            hint = "Enter 4-digit PIN"
            setHintTextColor(0xFF666666.toInt())
            setTextColor(Color.WHITE)
            textSize = 24f
            gravity = Gravity.CENTER
            inputType = android.text.InputType.TYPE_CLASS_NUMBER or 
                        android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
            maxLines = 1
            isFocusable = true
            isFocusableInTouchMode = true
            setPadding(40, 30, 40, 30)
            
            // Background
            background = GradientDrawable().apply {
                setColor(0xFF333333.toInt())
                cornerRadius = 12f
                setStroke(2, 0xFF555555.toInt())
            }
            
            // Focus change for border highlight
            setOnFocusChangeListener { _, hasFocus ->
                (background as? GradientDrawable)?.apply {
                    if (hasFocus) {
                        setStroke(3, 0xFFFFFFFF.toInt())
                    } else {
                        setStroke(2, 0xFF555555.toInt())
                    }
                }
            }
            
            // Handle done/enter key
            setOnEditorActionListener { _, actionId, _ ->
                if (actionId == EditorInfo.IME_ACTION_DONE) {
                    validatePassword()
                    true
                } else {
                    false
                }
            }
        }
        container.addView(pinInput)
        
        // Error text (hidden initially)
        errorText = TextView(context).apply {
            text = "Incorrect PIN"
            setTextColor(Color.RED)
            textSize = 16f
            gravity = Gravity.CENTER
            visibility = View.GONE
            setPadding(0, 20, 0, 0)
        }
        container.addView(errorText)
        
        // Button row
        val buttonRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 40, 0, 0)
        }
        
        val cancelButton = Button(context).apply {
            text = "Cancel"
            setTextColor(Color.WHITE)
            setBackgroundColor(0xFF444444.toInt())
            isFocusable = true
            isFocusableInTouchMode = true
            setPadding(60, 24, 60, 24)
            setOnClickListener {
                onCancel()
                dismiss()
            }
            setOnFocusChangeListener { _, hasFocus ->
                setBackgroundColor(if (hasFocus) 0xFF666666.toInt() else 0xFF444444.toInt())
            }
        }
        buttonRow.addView(cancelButton, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { 
            marginEnd = 24
        })
        
        val submitButton = Button(context).apply {
            text = "Submit"
            setTextColor(Color.WHITE)
            setBackgroundColor(0xFF0066CC.toInt())
            isFocusable = true
            isFocusableInTouchMode = true
            setPadding(60, 24, 60, 24)
            setOnClickListener { validatePassword() }
            setOnFocusChangeListener { _, hasFocus ->
                setBackgroundColor(if (hasFocus) 0xFF0088FF.toInt() else 0xFF0066CC.toInt())
            }
        }
        buttonRow.addView(submitButton)
        
        container.addView(buttonRow)
        
        setContentView(container)
        
        // Dialog window settings
        window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setLayout(700, WindowManager.LayoutParams.WRAP_CONTENT)
            setGravity(Gravity.CENTER)
            setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE)
        }
        
        setCancelable(true)
        setOnCancelListener { onCancel() }
    }
    
    private fun validatePassword() {
        val enteredPin = pinInput.text.toString()
        
        coroutineScope.launch {
            val correctPassword = withContext(Dispatchers.IO) {
                database.providerDao().getAnyAdultPassword()
            }
            
            // If no password set, accept any input or default to "0000"
            val passwordToCheck = if (correctPassword.isNullOrEmpty()) "0000" else correctPassword
            
            if (enteredPin == passwordToCheck) {
                // Hide keyboard
                val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
                imm.hideSoftInputFromWindow(pinInput.windowToken, 0)
                onPasswordCorrect()
                dismiss()
            } else {
                errorText.visibility = View.VISIBLE
                pinInput.text.clear()
                pinInput.requestFocus()
            }
        }
    }
    
    override fun show() {
        super.show()
        // Focus input and show keyboard
        pinInput.postDelayed({
            pinInput.requestFocus()
            val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showSoftInput(pinInput, InputMethodManager.SHOW_IMPLICIT)
        }, 200)
    }
}
