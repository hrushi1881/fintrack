# 🧭 FinTrack App - Clean Navigation Structure

## 📱 **Navigation Hierarchy**

```
📱 FinTrack App
├── 🔐 Authentication (To be implemented)
│   ├── Login Screen
│   ├── Signup Screen
│   └── Forgot Password
│
├── 📱 Main App (Tab Navigation)
│   ├── 🏠 Home (index.tsx)
│   │   ├── Dropdown Menu
│   │   │   ├── 🎯 Goals → /(tabs)/goals
│   │   │   ├── 💳 Liabilities → /(tabs)/liabilities
│   │   │   └── 📊 Budgets → /(tabs)/budgets
│   │   │
│   │   ├── Action Modals
│   │   │   ├── 💰 Pay Modal (modals/pay.tsx)
│   │   │   ├── 📥 Receive Modal (modals/receive.tsx)
│   │   │   └── 🔄 Transfer Modal (modals/transfer.tsx)
│   │   │
│   │   └── Account Cards → Account Detail (/account/[id])
│   │
│   ├── 💳 Accounts (accounts.tsx)
│   │   └── Account Cards → Account Detail (/account/[id])
│   │
│   ├── 📊 Analytics (analytics.tsx)
│   │   └── Financial Analytics Dashboard
│   │
│   ├── 🧾 Bills (bills.tsx)
│   │   └── Bill Cards → Bill Detail (/bill/[id])
│   │
│   ├── 🔄 Transactions (transactions.tsx)
│   │   └── Transaction Cards → Transaction Detail (/transaction/[id])
│   │
│   ├── 🎯 Goals (goals.tsx)
│   │   ├── Active Goals Tab
│   │   ├── Completed Goals Tab
│   │   └── Goal Cards → Goal Detail (/goal/[id])
│   │
│   ├── 📊 Budgets (budgets.tsx)
│   │   ├── Active Budgets Tab
│   │   ├── Completed Budgets Tab
│   │   └── Budget Cards → Budget Detail (/budget/[id])
│   │
│   └── 💳 Liabilities (liabilities.tsx)
│       ├── Active Debts Tab
│       ├── Paid Off Tab
│       └── Liability Cards → Liability Detail (/liability/[id])
│
└── 📱 Detail Screens (Stack Navigation)
    ├── Account Detail (/account/[id])
    │   ├── Pockets Tab
    │   ├── Transactions Tab
    │   ├── Analytics Tab
    │   └── Settings Tab
    │
    ├── Bill Detail (/bill/[id])
    │   ├── Overview Tab
    │   ├── History Tab
    │   └── Settings Tab
    │
    ├── Transaction Detail (/transaction/[id])
    │   ├── Transaction Info
    │   ├── Category Details
    │   └── Tags & Notes
    │
    ├── Goal Detail (/goal/[id])
    │   ├── Goal Progress
    │   ├── Contributions
    │   └── Timeline
    │
    ├── Budget Detail (/budget/[id])
    │   ├── Budget Overview
    │   ├── Spending Analysis
    │   └── Alerts
    │
    └── Liability Detail (/liability/[id])
        ├── Payment History
        ├── Payment Calculator
        └── Payoff Strategy
```

## 🗂️ **File Structure**

```
app/
├── _layout.tsx                    # Root layout
├── (tabs)/                        # Tab navigation group
│   ├── _layout.tsx               # Tab layout configuration
│   ├── index.tsx                 # Home screen
│   ├── accounts.tsx              # Accounts screen
│   ├── analytics.tsx             # Analytics screen
│   ├── bills.tsx                 # Bills screen
│   ├── transactions.tsx          # Transactions screen
│   ├── goals.tsx                 # Goals screen
│   ├── budgets.tsx               # Budgets screen
│   └── liabilities.tsx            # Liabilities screen
├── account/
│   └── [id].tsx                  # Account detail screen
├── bill/
│   └── [id].tsx                  # Bill detail screen
├── transaction/
│   └── [id].tsx                  # Transaction detail screen
├── goal/
│   └── [id].tsx                  # Goal detail screen (to be created)
├── budget/
│   └── [id].tsx                  # Budget detail screen (to be created)
├── liability/
│   └── [id].tsx                  # Liability detail screen (to be created)
├── modals/
│   ├── pay.tsx                   # Pay modal
│   ├── receive.tsx               # Receive modal
│   └── transfer.tsx              # Transfer modal
├── modal.tsx                     # Generic modal
└── expandable-tabs-demo.tsx      # Demo screen
```

## 🔄 **Navigation Patterns**

### **1. Tab Navigation (Bottom Tabs)**
- **Primary Navigation**: Home, Accounts, Analytics, Bills, Transactions
- **Secondary Navigation**: Goals, Budgets, Liabilities
- **Access**: Direct tab access + dropdown menu from home

### **2. Stack Navigation (Detail Screens)**
- **Account Detail**: `/account/[id]`
- **Bill Detail**: `/bill/[id]`
- **Transaction Detail**: `/transaction/[id]`
- **Goal Detail**: `/goal/[id]` (to be created)
- **Budget Detail**: `/budget/[id]` (to be created)
- **Liability Detail**: `/liability/[id]` (to be created)

### **3. Modal Navigation (Overlay Screens)**
- **Pay Modal**: `modals/pay.tsx`
- **Receive Modal**: `modals/receive.tsx`
- **Transfer Modal**: `modals/transfer.tsx`
- **Generic Modal**: `modal.tsx`

### **4. Dropdown Navigation (From Home)**
- **Goals**: `/(tabs)/goals`
- **Liabilities**: `/(tabs)/liabilities`
- **Budgets**: `/(tabs)/budgets`

## 🎯 **Navigation Features**

### **✅ Implemented**
- ✅ Clean tab navigation structure
- ✅ Dropdown menu navigation
- ✅ Modal navigation
- ✅ Detail screen navigation
- ✅ Consistent routing patterns
- ✅ Removed duplicate routes

### **🚧 To Be Implemented**
- 🚧 Authentication flow
- 🚧 Goal detail screens
- 🚧 Budget detail screens
- 🚧 Liability detail screens
- 🚧 Navigation guards
- 🚧 Deep linking support

## 🔧 **Navigation Configuration**

### **Tab Layout Configuration**
```typescript
// app/(tabs)/_layout.tsx
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#10B981',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#000000',
          borderTopColor: 'rgba(255, 255, 255, 0.1)',
          borderTopWidth: 1,
          height: 70,
          paddingBottom: 12,
          paddingTop: 12,
          paddingHorizontal: 20,
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      {/* Tab screens */}
    </Tabs>
  );
}
```

### **Dropdown Menu Configuration**
```typescript
// components/DropdownMenu.tsx
const menuItems: MenuItem[] = [
  {
    id: 'goals',
    label: 'Goals',
    icon: 'flag',
    route: '/(tabs)/goals',
    color: '#10B981',
  },
  {
    id: 'liabilities',
    label: 'Liabilities',
    icon: 'card',
    route: '/(tabs)/liabilities',
    color: '#EF4444',
  },
  {
    id: 'budgets',
    label: 'Budgets',
    icon: 'pie-chart',
    route: '/(tabs)/budgets',
    color: '#3B82F6',
  },
];
```

## 🚀 **Next Steps**

1. **Create Detail Screens**: Implement goal, budget, and liability detail screens
2. **Add Authentication**: Implement login/signup flow
3. **Navigation Guards**: Add authentication checks
4. **Deep Linking**: Support URL-based navigation
5. **State Management**: Implement navigation state persistence

---

**Last Updated**: January 2024  
**Status**: ✅ Clean navigation structure implemented  
**Next**: Implement missing detail screens and authentication flow
