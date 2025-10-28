declare module '@react-native-community/slider' {
  import { Component } from 'react';
  import { StyleProp, ViewStyle } from 'react-native';

  export interface SliderProps {
    style?: StyleProp<ViewStyle>;
    minimumValue?: number;
    maximumValue?: number;
    value?: number;
    step?: number;
    disabled?: boolean;
    minimumTrackTintColor?: string;
    maximumTrackTintColor?: string;
    thumbTintColor?: string;
    onSlidingComplete?: (value: number) => void;
    onValueChange?: (value: number) => void;
  }

  export default class Slider extends Component<SliderProps> {}
}
