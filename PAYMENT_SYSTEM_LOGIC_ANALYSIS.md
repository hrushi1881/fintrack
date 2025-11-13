# Payment System Logic Analysis

## Core Concepts from Reference Code

### 1. Bill Structure
Each bill represents a single payment obligation with:
- **Amount**: Total payment amount
- **Principal Amount**: Portion that reduces the debt
- **Interest Amount**: Portion that goes to interest
- **Due Date**: When payment is due
- **Status**: `scheduled`, `paid`, `overdue`
- **Month Number**: Payment sequence (1, 2, 3, ...)
- **Remaining Balance**: Balance after this payment
- **Paid Date**: When payment was made (if paid)
- **Paid Amount**: Amount actually paid (if different from scheduled)

### 2. Bill Generation Logic

#### Amortization Formula
```
PMT = P * [r(1+r)^n] / [(1+r)^n - 1]
Where:
- P = Principal (loan amount)
- r = Monthly interest rate (annual rate / 12 / 100)
- n = Number of payments
- PMT = Monthly payment
```

#### Bill Generation Process
1. Start with principal amount (total loan)
2. For each payment:
   - Calculate interest on remaining balance: `interest = balance * monthlyRate`
   - Calculate principal: `principal = payment - interest`
   - Update balance: `balance = balance - principal`
   - Create bill with these values
3. Last payment adjusts to pay off exactly

### 3. Payment Flow

#### When User Pays a Bill:
1. User selects bill to pay
2. System shows payment preview:
   - Account balance before/after
   - Fund balance before/after
   - Liability balance before/after
   - Principal paid
   - Interest paid
   - Remaining balance
   - Next payment due
3. User confirms payment
4. System:
   - Creates transaction
   - Updates bill status to 'paid'
   - Updates liability balance
   - Updates account/fund balances
   - Records payment date and amount

### 4. Interest Amount Handling

#### Option A: Interest Included in Total
- Total Amount = Principal + Interest
- User pays: Total Amount
- Interest shown separately for breakdown
- Example: ₹10,247 = ₹6,705 principal + ₹3,542 interest

#### Option B: Interest Separate
- Total Amount = Principal only
- Interest Amount tracked separately
- User pays: Principal + Interest (separate transactions)
- Example: ₹6,705 principal + ₹3,542 interest (separate)

### 5. Extra Payment Options

When user pays more than scheduled amount:

#### Option 1: Reduce Monthly Payment
- Keep same end date
- Lower monthly payment
- Total interest: slightly less
- Example: ₹45,000 → ₹42,300/month

#### Option 2: Reduce Loan Term
- Keep same monthly payment
- Finish earlier
- Total interest saved: significant
- Example: Finish 14 months earlier, save ₹2,34,000

#### Option 3: Skip Next Payments
- Pre-pay for next N months
- No payment due until month N+1
- Interest continues accruing (costs more overall)

#### Option 4: Just Reduce Principal
- Everything stays same (payment, end date)
- Owe less
- Total interest reduces
- Simplest option

### 6. Bill Editing

#### Editable Fields:
- **Amount**: Can change payment amount
  - One-time change (only this payment)
  - Update all future payments
  - Add difference to next payment
- **Date**: Can change due date
  - Must be between start-date and end-date
  - Validates against liability constraints
- **Interest Amount**: Can adjust interest
  - Recalculates principal
  - Updates total amount
- **Account**: Can change payment account
- **Description**: Can update description

#### Date Validation:
- Bill date must be >= liability start_date
- Bill date must be <= liability end_date
- System validates on edit
- Shows error if invalid

### 7. Automatic Amount Adjustment

#### Interest Rate Change:
- User updates interest rate
- System recalculates all pending bills
- Shows impact: new amounts, new total interest
- User confirms or rejects changes

#### Balance Change:
- User makes extra payment
- System recalculates remaining bills
- Adjusts amounts to maintain end date
- Or adjusts end date to maintain amounts

### 8. Bill Status Management

#### Status Values:
- **scheduled**: Upcoming payment
- **paid**: Payment completed
- **overdue**: Payment past due date
- **cancelled**: Payment cancelled/skipped

#### Status Calculation:
- If paid: status = 'paid'
- If cancelled: status = 'cancelled'
- If due date < today: status = 'overdue'
- If due date = today: status = 'due_today'
- If due date > today: status = 'scheduled' or 'upcoming'

### 9. Payment Impact Preview

#### What to Show:
- **Account Balance**: Before → After
- **Fund Balance**: Before → After
- **Liability Balance**: Before → After
- **Principal Paid**: Amount reducing debt
- **Interest Paid**: Amount going to interest
- **Total Paid**: Total payment amount
- **Remaining Balance**: Balance after payment
- **Next Payment Due**: Date and amount of next payment

### 10. Interest Calculations

#### Total Interest:
- Sum of all interest amounts in all bills
- Shows total interest over life of loan

#### Interest Paid:
- Sum of interest amounts in paid bills
- Shows interest paid so far

#### Interest Remaining:
- Total Interest - Interest Paid
- Shows interest yet to be paid

### 11. Progress Tracking

#### Progress Calculation:
```
Progress = ((Original Amount - Current Balance) / Original Amount) * 100
```

#### Visual Indicators:
- Progress bar showing % paid
- Current balance vs original amount
- Amount paid vs amount remaining
- Number of payments made vs total payments

### 12. Bill Display

#### Upcoming Bills:
- Show next 5-10 scheduled bills
- Each bill shows: date, amount, principal, interest
- Can pay directly from list
- Can edit bill from list

#### Payment History:
- Show last 10-20 paid bills
- Each bill shows: date, amount, principal, interest, paid date
- Can view full history

#### Full Schedule:
- Show all bills (paid and pending)
- Each bill shows: month number, date, amount, status, balance
- Can filter by status
- Can sort by date

### 13. Calendar Integration

#### Bills on Calendar:
- Each bill appears on its due date
- Color-coded by status:
  - Orange: scheduled/upcoming
  - Red: overdue
  - Green: paid
  - Gray: cancelled
- Tapping bill opens bill detail
- Can pay directly from calendar

### 14. Key Differences from Current System

#### Current System (liability_schedules):
- Uses `liability_schedules` table
- Status: `pending`, `completed`, `cancelled`, `overdue`
- Metadata stores principal/interest breakdown
- Less integrated with bills system

#### New System (bills):
- Uses `bills` table with `liability_id`
- Status: `scheduled`, `paid`, `overdue`, `cancelled`
- Direct fields for principal/interest
- Fully integrated with bills system
- Can be displayed on calendar
- Can be edited individually
- Supports interest included/separate

### 15. Implementation Requirements

#### Database:
- Bills table with liability_id
- Interest and principal amount fields
- Payment number field
- Interest included flag
- Status field with proper values

#### Frontend:
- Bill generation on liability creation
- Bill list in liability detail
- Bill payment modal with impact preview
- Bill editing modal
- Calendar integration
- Progress tracking
- Interest summary

#### Backend:
- Bill generation function
- Payment processing
- Impact calculation
- Status updates
- Date validation
- Auto-adjustment functions

