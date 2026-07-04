# Select

Styled native dropdown for filters (property type, sort order, rooms); accepts `options` or `<option>` children.

```jsx
<Select label="Property type" iconStart="house" placeholder="Any type"
        options={['Apartment','House','Villa','Plot','Studio']} />
<Select label="Sort by" size="sm"
        options={[{value:'new',label:'Newest first'},{value:'price',label:'Price: low to high'}]} />
```

- Sizes: `sm` · `md` · `lg`. `placeholder` renders a greyed, disabled first option.
- Uses a real `<select>` — keyboard, native mobile picker, and `onChange` all work.
