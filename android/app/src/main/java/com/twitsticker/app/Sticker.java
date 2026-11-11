package com.twitsticker.app;

import java.util.ArrayList;
import java.util.List;

public class Sticker {
    public String imageFileName;
    public List<String> emojis;
    public long size;

    public Sticker(String imageFileName, List<String> emojis) {
        this.imageFileName = imageFileName;
        this.emojis = emojis != null ? emojis : new ArrayList<>();
    }
}

