# Liability System Redesign Plan

## Design System Specifications

### Typography
- **Page Headings**: Helvetica Neue Bold (32px) - System font with fontWeight: '700'
- **Section Titles**: Poppins SemiBold (18-20px) - System font with fontWeight: '600'
- **Body Text**: Instrument Serif Regular (14-16px) - System font
- **Labels/Captions**: Instrument Serif Regular (12-13px) - System font

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

### Spacing
- **Screen Padding**: 20px horizontal
- **Card Padding**: 20px
- **Element Gap**: 16px
- **Section Gap**: 24px

---

## Feature Implementation Plan

### Phase 1: UI/UX Redesign (Current)

#### 1.1 Liabilities List Screen ✅
- [x] White background
- [x] Glass cards for liability items
- [x] Summary card with metrics
- [x] Segmented control (Upcoming/All)
- [x] Typography system (Helvetica Neue, Poppins, Instrument Serif)
- [x] Status badges
- [x] Progress bars
- [x] Empty states

#### 1.2 Liability Detail Screen (Next)
- [ ] Hero section with current balance
- [ ] Glass cards for metrics
- [ ] Amortization schedule view
- [ ] Payment history
- [ ] Linked accounts
- [ ] Action buttons (Pay, Draw Funds, Edit, Delete)
- [ ] Payment breakdown (Principal vs Interest)

#### 1.3 Add Liability Modal (Next)
- [ ] 5-question flow:
  1. What should we call this?
  2. What type of liability?
  3. How much do you owe?
  4. What's your monthly payment?
  5. When is first payment due?
- [ ] Optional: Did you receive money?
- [ ] Optional: Fund allocation
- [ ] Automatic bill generation preview
- [ ] Summary before creation

#### 1.4 Pay Liability Modal (Next)
- [ ] Fund source selection (Personal/Liability)
- [ ] Amount input
- [ ] Payment date
- [ ] Payment breakdown preview
- [ ] Options for extra payment handling

#### 1.5 Edit Liability Modal (Next)
- [ ] Change total amount
- [ ] Change interest rate
- [ ] Change end date
- [ ] Change monthly payment
- [ ] Impact analysis before confirming

#### 1.6 Payment Adjustment Modals (Next)
- [ ] Skip payment modal
- [ ] Postpone payment modal
- [ ] Extra payment options modal
- [ ] Partial payment handling

### Phase 2: Backend Updates

#### 2.1 Automatic Bill Generation
- [ ] Create `generate_liability_bills` RPC function
- [ ] Generate all bills on liability creation
- [ ] Calculate principal/interest breakdown
- [ ] Handle different payment frequencies
- [ ] Update bills when liability changes

#### 2.2 Payment Adjustments
- [ ] Skip payment logic
- [ ] Postpone payment logic
- [ ] Extra payment handling
- [ ] Partial payment handling
- [ ] Recalculate schedule after adjustments

#### 2.3 Interest Calculations
- [ ] Real-time interest calculation
- [ ] Amortization schedule generation
- [ ] Principal vs interest breakdown
- [ ] Support for different interest types (reducing, fixed, compound)

#### 2.4 Liability Editing
- [ ] Change total amount (with restrictions)
- [ ] Change interest rate (recalculate)
- [ ] Change end date (recalculate)
- [ ] Change monthly payment (recalculate)
- [ ] Impact analysis before saving

---

## Implementation Steps

### Step 1: Create Design System Components
1. GlassCard component ✅
2. Typography components
3. Button components
4. Input components
5. Badge components

### Step 2: Redesign Screens
1. Liabilities list screen ✅
2. Liability detail screen
3. Add liability modal
4. Pay liability modal
5. Edit liability modal
6. Payment adjustment modals

### Step 3: Update Backend
1. Bill generation RPC
2. Payment adjustment RPCs
3. Interest calculation functions
4. Liability editing functions
5. Amortization schedule generation

### Step 4: Testing
1. UI/UX testing
2. Functionality testing
3. Edge case testing
4. Performance testing

---

## Key Features to Implement

### 1. Automatic Bill Generation
When a liability is created, automatically generate all payment bills based on:
- Total amount
- Monthly payment
- Interest rate
- Start date
- Payment frequency

### 2. Payment Adjustments
Support for:
- Skipping payments
- Postponing payments
- Extra payments
- Partial payments
- Early payoff

### 3. Interest Calculations
- Real-time interest calculation
- Principal vs interest breakdown
- Amortization schedule
- Total interest tracking

### 4. Liability Editing
- Change total amount (with validation)
- Change interest rate (with recalculation)
- Change end date (with recalculation)
- Change monthly payment (with recalculation)
- Show impact before confirming

### 5. Fund Management
- Track liability funds in accounts
- Fund allocation during creation
- Fund drawing
- Fund conversion

---

## Next Steps

1. Complete liability detail screen redesign
2. Create add liability modal with 5-question flow
3. Implement automatic bill generation
4. Add payment adjustment features
5. Update backend functions
6. Test all features
7. Document changes

