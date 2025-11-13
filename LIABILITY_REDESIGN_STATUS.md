# Liability System Redesign - Current Status

## ✅ Completed Features

### 1. UI/UX Redesign

#### ✅ Liabilities List Screen
- White background with glass card design
- Summary metrics card
- Segmented control (Upcoming/All)
- Progress bars and status badges
- Typography: Helvetica Neue Bold (headings), Poppins (titles), Instrument Serif (body)
- Empty and loading states

#### ✅ Liability Detail Screen
- Hero section with current balance
- Glass cards for metrics
- Payment breakdown (Principal vs Interest)
- Payment history with details
- Linked accounts display
- Recent activity log
- Progress visualization
- Action buttons (Pay, Draw Funds)

#### ✅ Add Liability Modal - Simplified 5-Question Flow
- **Question 1**: What should we call this? (Name input)
- **Question 2**: What type of liability? (Loan, Credit Card, EMI, Line of Credit, Other)
- **Question 3**: How much do you owe in total? (Total amount)
- **Question 4**: What's your monthly payment? (Monthly payment with auto-calculation)
- **Question 5**: When is your first payment due? (Date picker)
- **Question 6**: Did you receive money? (Optional - Yes/No with account selection)
- Step indicator
- Automatic calculation of:
  - Number of payments
  - Approximate interest rate
  - Final payment date
- Glass card design throughout

### 2. Backend Updates

#### ✅ Automatic Bill Generation
- Bills are automatically generated when liability is created
- Creates entries in `liability_schedules` table
- Calculates payment schedule based on:
  - Total amount
  - Monthly payment
  - Interest rate
  - First payment date
- Handles interest calculations (reducing balance method)
- Stores payment breakdown (principal/interest) in payment records

#### ✅ Context Updates
- Updated `createLiability` to handle `periodical_payment` for loans
- Stores monthly payment in database
- Sets `next_due_date` to first payment date
- Handles fund allocations for received money

---

## 🚧 In Progress

### Payment Modal Redesign
- Need to update pay liability modal with:
  - Glass card design
  - Fund source selection (Personal/Liability)
  - Payment breakdown preview
  - Extra payment options

---

## 📋 Pending Features

### 1. UI/UX

#### Payment Modal (`app/modals/pay-liability.tsx`)
- [ ] Glass card design
- [ ] Fund source selection (Personal/Liability)
- [ ] Amount input with validation
- [ ] Payment date picker
- [ ] Payment breakdown preview (Principal vs Interest)
- [ ] Extra payment options modal
- [ ] Payment confirmation

#### Edit Liability Modal (New)
- [ ] Change total amount (with restrictions)
- [ ] Change interest rate (with recalculation)
- [ ] Change end date (with recalculation)
- [ ] Change monthly payment (with recalculation)
- [ ] Impact analysis before confirming
- [ ] Glass card design

#### Payment Adjustment Modals (New)
- [ ] Skip payment modal
  - Options: Add to next payment, Add to end, Spread across remaining
- [ ] Postpone payment modal
  - Date picker
  - Impact analysis
- [ ] Extra payment options modal
  - Options: Reduce monthly payment, Reduce term, Skip payments, Just reduce principal
- [ ] Partial payment handling

#### Draw Liability Funds Modal (`app/modals/draw-liability-funds.tsx`)
- [ ] Glass card design
- [ ] Account selection
- [ ] Amount distribution
- [ ] Category selection
- [ ] Notes input

### 2. Backend

#### Bill Generation Enhancements
- [ ] Store principal/interest breakdown in liability_schedules
- [ ] Add metadata column to liability_schedules (migration needed)
- [ ] Improve interest calculation accuracy
- [ ] Handle different payment frequencies (weekly, bi-weekly, etc.)
- [ ] Support for variable interest rates

#### Payment Adjustments
- [ ] Skip payment logic
  - Add to next payment
  - Add to end of loan
  - Spread across remaining payments
- [ ] Postpone payment logic
  - Update due dates
  - Recalculate schedule
- [ ] Extra payment handling
  - Reduce monthly payment
  - Reduce loan term
  - Skip next few payments
  - Just reduce principal
- [ ] Partial payment handling
  - Track partial payments
  - Apply to next payment or end of term

#### Liability Editing
- [ ] Change total amount (with validation)
  - Cannot reduce below current balance
  - Recalculate schedule
- [ ] Change interest rate
  - Recalculate all remaining bills
  - Update principal/interest breakdown
- [ ] Change end date
  - Recalculate monthly payment
  - Update all bills
- [ ] Change monthly payment
  - Recalculate end date
  - Update all bills
- [ ] Impact analysis
  - Show before/after comparison
  - Interest savings/costs
  - Term changes

#### Amortization Schedule
- [ ] Generate full amortization schedule
- [ ] Display in liability detail screen
- [ ] Export functionality
- [ ] Principal vs Interest visualization

#### Bill-Liability Integration
- [ ] Link bills table to liabilities (if needed)
- [ ] Update bills when liability payment made
- [ ] Mark bills as paid when payment recorded
- [ ] Sync bill status with liability status

---

## 🎯 Design System

### Typography
- **Page Headings**: Helvetica Neue Bold (32px) - `fontFamily: 'HelveticaNeue-Bold', fontWeight: '700'`
- **Section Titles**: Poppins SemiBold (18-20px) - `fontFamily: 'Poppins-SemiBold', fontWeight: '600'`
- **Body Text**: Instrument Serif Regular (14-16px) - `fontFamily: 'InstrumentSerif-Regular'`
- **Labels/Captions**: Instrument Serif Regular (12-13px) - `fontFamily: 'InstrumentSerif-Regular'`

### Colors
- **Background**: #FFFFFF (White)
- **Text Primary**: #000000 (Black)
- **Text Secondary**: rgba(0, 0, 0, 0.6)
- **Text Tertiary**: rgba(0, 0, 0, 0.4)
- **Glass Card Background**: rgba(255, 255, 255, 0.7) with blur
- **Glass Card Border**: rgba(0, 0, 0, 0.08)

### Glass Cards (iOS 26 Style)
- **Background**: rgba(255, 255, 255, 0.7) with BlurView intensity: 20
- **Border**: 0.5px solid rgba(0, 0, 0, 0.08)
- **Border Radius**: 24px
- **Shadow**: Subtle (opacity: 0.08, radius: 12)
- **Padding**: 20px default
- **Margin**: 12px vertical between cards

---

## 📝 Implementation Notes

### Automatic Bill Generation
- Bills are created in `liability_schedules` table
- Each bill has:
  - `due_date`: When payment is due
  - `amount`: Payment amount
  - `status`: pending, completed, cancelled, overdue
  - `user_id` and `liability_id`: Links to user and liability
- Principal/interest breakdown is calculated but not stored in schedules table
- Breakdown is stored when payment is recorded in `liability_payments` table

### Interest Calculation
- Uses reducing balance method
- Monthly interest = (Annual Rate / 12 / 100) × Remaining Balance
- Principal = Payment Amount - Interest
- Last payment adjusted to pay off remaining balance exactly

### Fund Allocation
- When user receives money from liability:
  - Creates `account_liability_portions` record
  - Updates account balance
  - Creates liability fund in account
  - Tracks disbursement amount

---

## 🔄 Next Steps

1. **Complete Payment Modal Redesign**
   - Update UI with glass cards
   - Add fund selection
   - Add payment breakdown
   - Add extra payment options

2. **Create Edit Liability Modal**
   - Build modal with impact analysis
   - Add validation logic
   - Implement recalculation

3. **Create Payment Adjustment Modals**
   - Skip payment modal
   - Postpone payment modal
   - Extra payment options modal

4. **Backend Enhancements**
   - Add metadata column to liability_schedules
   - Improve interest calculations
   - Add payment adjustment logic
   - Add liability editing logic

5. **Testing**
   - Test bill generation
   - Test payment flow
   - Test fund allocation
   - Test payment adjustments

---

## 📚 Related Files

### Frontend
- `app/(tabs)/liabilities.tsx` - Liabilities list screen ✅
- `app/liability/[id].tsx` - Liability detail screen ✅
- `app/modals/add-liability.tsx` - Add liability modal ✅
- `app/modals/pay-liability.tsx` - Pay liability modal (needs redesign)
- `app/modals/draw-liability-funds.tsx` - Draw funds modal (needs redesign)
- `components/GlassCard.tsx` - Glass card component ✅

### Backend
- `contexts/LiabilitiesContext.tsx` - Liabilities context ✅ (updated)
- `migrations/011_create_liabilities_system.sql` - Liabilities tables
- `migrations/012_create_account_liability_portions.sql` - Account portions
- `utils/liabilities.ts` - Liability utility functions

---

Last Updated: 2025-01-27

